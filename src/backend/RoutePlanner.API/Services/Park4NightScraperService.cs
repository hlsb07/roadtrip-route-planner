using HtmlAgilityPack;
using RoutePlanner.API.Models;
using NetTopologySuite.Geometries;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace RoutePlanner.API.Services
{
    public class Park4NightScraperService
    {
        private readonly HttpClient _httpClient;
        private readonly ILogger<Park4NightScraperService> _logger;
        private readonly string _imagesBasePath;
        private readonly string _activitiesBasePath;
        private readonly string _servicesBasePath;
        private readonly string _typesBasePath;
        private readonly GeometryFactory _geometryFactory;

        public Park4NightScraperService(
            HttpClient httpClient,
            ILogger<Park4NightScraperService> logger,
            IWebHostEnvironment env)
        {
            _httpClient = httpClient;
            _logger = logger;

            // Use shared directory instead of wwwroot
            // Navigate from ContentRootPath (backend folder) to shared folder
            var projectRoot = Path.GetFullPath(Path.Combine(env.ContentRootPath, "..", "..", "shared"));
            var sharedImagesPath = Path.Combine(projectRoot, "images", "campsites");

            _imagesBasePath = sharedImagesPath;
            _activitiesBasePath = Path.Combine(sharedImagesPath, "activities");
            _servicesBasePath = Path.Combine(sharedImagesPath, "services");
            _typesBasePath = Path.Combine(sharedImagesPath, "types");
            _geometryFactory = new GeometryFactory(new PrecisionModel(), 4326);

            // Ensure directories exist
            Directory.CreateDirectory(_imagesBasePath);
            Directory.CreateDirectory(_activitiesBasePath);
            Directory.CreateDirectory(_servicesBasePath);
            Directory.CreateDirectory(_typesBasePath);

            _logger.LogInformation("Using shared images directory: {Path}", _imagesBasePath);

            // Configure HttpClient
            _httpClient.DefaultRequestHeaders.Add("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");
        }

        /// <summary>
        /// Scrapes campsite data from a Park4Night URL
        /// </summary>
        public async Task<Campsite?> ScrapeCampsiteAsync(string url)
        {
            try
            {
                // Normalize URL (handles Android share format and other variations)
                url = NormalizeUrl(url);

                _logger.LogInformation("Starting to scrape Park4Night URL: {Url}", url);

                // Extract Park4Night ID from URL
                var park4NightId = ExtractPark4NightId(url);
                if (string.IsNullOrEmpty(park4NightId))
                {
                    _logger.LogError("Could not extract Park4Night ID from URL: {Url}", url);
                    return null;
                }

                // Download HTML content
                var html = await _httpClient.GetStringAsync(url);
                var htmlDoc = new HtmlDocument();
                htmlDoc.LoadHtml(html);

                // Create campsite object
                var campsite = new Campsite
                {
                    Source = CampsiteSource.Park4Night,
                    Park4NightId = park4NightId,
                    CamperMateId = null, // Not applicable for Park4Night
                    SourceUrl = url,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                };

                // Extract data from HTML
                campsite.Name = ExtractName(htmlDoc);
                var (lat, lon) = ExtractCoordinates(htmlDoc);
                campsite.Location = _geometryFactory.CreatePoint(new Coordinate(lon, lat));
                campsite.Rating = ExtractRating(htmlDoc);

                // Extract types with SVG icons
                var types = await ExtractTypeAsync(htmlDoc, url);
                campsite.TypesList = types.Count > 0 ? types : null;

                // Extract services with SVG icons
                var services = await ExtractServicesAsync(htmlDoc, url);
                campsite.ServicesList = services.Count > 0 ? services : null;

                // Extract activities with SVG icons
                var activities = await ExtractActivitiesAsync(htmlDoc, url);
                campsite.ActivitiesList = activities.Count > 0 ? activities : null;

                campsite.Price = ExtractPrice(htmlDoc);
                campsite.NumberOfSpots = ExtractNumberOfSpots(htmlDoc);

                // Extract multi-language descriptions
                var descriptions = ExtractDescriptions(htmlDoc);
                campsite.DescriptionsDict = descriptions.Count > 0 ? descriptions : null;

                // Download and save images
                var imageUrls = ExtractImageUrls(htmlDoc, url);
                var imagePaths = await DownloadImagesAsync(imageUrls, park4NightId);
                campsite.ImagePaths = JsonSerializer.Serialize(imagePaths);

                _logger.LogInformation("Successfully scraped campsite: {Name} (ID: {Id})", campsite.Name, campsite.Park4NightId);
                return campsite;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error scraping Park4Night URL: {Url}", url);
                return null;
            }
        }

        /// <summary>
        /// Normalizes Park4Night URLs from various formats (desktop, Android share) to a standard format.
        /// Android format: "@park4night : https://park4night.com/de/lieu/56018/open/" or "https://park4night.com/de/lieu/56018/open/"
        /// Desktop format: "https://park4night.com/de/place/56018"
        /// </summary>
        private string NormalizeUrl(string url)
        {
            // Remove "@park4night : " prefix if present (Android share format)
            if (url.Contains("@park4night"))
            {
                var urlMatch = Regex.Match(url, @"https?://[^\s]+");
                if (urlMatch.Success)
                {
                    url = urlMatch.Value;
                }
            }

            // Extract the ID from either "place" or "lieu" format
            var idMatch = Regex.Match(url, @"/(?:place|lieu)/(\d+)");
            if (idMatch.Success)
            {
                var id = idMatch.Groups[1].Value;

                // Extract language code (e.g., "de", "en", "fr")
                var langMatch = Regex.Match(url, @"park4night\.com/(\w{2})/");
                var lang = langMatch.Success ? langMatch.Groups[1].Value : "en";

                // Return normalized desktop format
                var normalizedUrl = $"https://park4night.com/{lang}/place/{id}";
                _logger.LogInformation("Normalized URL from '{OriginalUrl}' to '{NormalizedUrl}'", url, normalizedUrl);
                return normalizedUrl;
            }

            // Return original URL if no normalization needed
            return url;
        }

        private string ExtractPark4NightId(string url)
        {
            // Extract ID from URL like https://park4night.com/de/place/561613 or https://park4night.com/de/lieu/56018/open/
            var match = Regex.Match(url, @"/(?:place|lieu)/(\d+)");
            return match.Success ? match.Groups[1].Value : string.Empty;
        }

        private string ExtractName(HtmlDocument doc)
        {
            // Try multiple selectors for the name
            var nameNode = doc.DocumentNode.SelectSingleNode("//h1[@class='place-title']") ??
                          doc.DocumentNode.SelectSingleNode("//h1[contains(@class, 'title')]") ??
                          doc.DocumentNode.SelectSingleNode("//h1");

            var name = nameNode?.InnerText.Trim() ?? "Unknown Campsite";

            // Truncate to database max length (300)
            if (name.Length > 300)
            {
                _logger.LogWarning("Name field truncated from {Length} to 300 characters", name.Length);
                return name.Substring(0, 300);
            }

            return name;
        }

        private (double lat, double lon) ExtractCoordinates(HtmlDocument doc)
        {
            try
            {
                // Method 1: Try to extract from place-info-location section
                var locationList = doc.DocumentNode.SelectSingleNode("//ul[contains(@class, 'place-info-location')]");
                if (locationList != null)
                {
                    var firstLi = locationList.SelectSingleNode(".//li");
                    if (firstLi != null)
                    {
                        var coordSpan = firstLi.SelectSingleNode(".//p/span");
                        if (coordSpan != null)
                        {
                            var coordText = coordSpan.InnerText.Trim();
                            // Expected format: "-43.4988, 172.7279 (lat, lng)" or "43.4988, 172.7279"
                            var match = Regex.Match(coordText, @"(-?\d+\.?\d*),\s*(-?\d+\.?\d*)");
                            if (match.Success)
                            {
                                var lat = double.Parse(match.Groups[1].Value, System.Globalization.CultureInfo.InvariantCulture);
                                var lon = double.Parse(match.Groups[2].Value, System.Globalization.CultureInfo.InvariantCulture);
                                _logger.LogInformation("Extracted coordinates from place-info-location: {Lat}, {Lon}", lat, lon);
                                return (lat, lon);
                            }
                        }
                    }
                }

                // Method 2: Look for coordinates in meta tags
                var latNode = doc.DocumentNode.SelectSingleNode("//meta[@property='place:location:latitude']");
                var lonNode = doc.DocumentNode.SelectSingleNode("//meta[@property='place:location:longitude']");

                if (latNode != null && lonNode != null)
                {
                    var lat = double.Parse(latNode.GetAttributeValue("content", "0"), System.Globalization.CultureInfo.InvariantCulture);
                    var lon = double.Parse(lonNode.GetAttributeValue("content", "0"), System.Globalization.CultureInfo.InvariantCulture);
                    _logger.LogInformation("Extracted coordinates from meta tags: {Lat}, {Lon}", lat, lon);
                    return (lat, lon);
                }

                // Method 3: Try extracting from JavaScript/JSON-LD
                var scriptNodes = doc.DocumentNode.SelectNodes("//script[@type='application/ld+json']");
                if (scriptNodes != null)
                {
                    foreach (var script in scriptNodes)
                    {
                        try
                        {
                            var json = JsonDocument.Parse(script.InnerText);
                            if (json.RootElement.TryGetProperty("geo", out var geo))
                            {
                                var lat = geo.GetProperty("latitude").GetDouble();
                                var lon = geo.GetProperty("longitude").GetDouble();
                                _logger.LogInformation("Extracted coordinates from JSON-LD: {Lat}, {Lon}", lat, lon);
                                return (lat, lon);
                            }
                        }
                        catch { }
                    }
                }

                // Method 4: Fallback - try to find in data-lat and data-lng attributes
                var mapNode = doc.DocumentNode.SelectSingleNode("//*[@data-lat]");
                if (mapNode != null)
                {
                    var lat = double.Parse(mapNode.GetAttributeValue("data-lat", "0"), System.Globalization.CultureInfo.InvariantCulture);
                    var lon = double.Parse(mapNode.GetAttributeValue("data-lng", "0"), System.Globalization.CultureInfo.InvariantCulture);
                    _logger.LogInformation("Extracted coordinates from data attributes: {Lat}, {Lon}", lat, lon);
                    return (lat, lon);
                }

                _logger.LogWarning("Could not extract coordinates from any source");
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Error extracting coordinates, using default");
            }

            return (0, 0);
        }

        private decimal? ExtractRating(HtmlDocument doc)
        {
            try
            {
                var ratingNode = doc.DocumentNode.SelectSingleNode("//span[@class='rating-value']") ??
                                doc.DocumentNode.SelectSingleNode("//*[contains(@class, 'rating')]//span");

                if (ratingNode != null)
                {
                    var ratingText = Regex.Match(ratingNode.InnerText, @"(\d+\.?\d*)").Value;
                    if (decimal.TryParse(ratingText, System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out var rating))
                    {
                        return rating;
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Error extracting rating");
            }

            return null;
        }

        private async Task<List<CampsiteType>> ExtractTypeAsync(HtmlDocument doc, string baseUrl)
        {
            var types = new List<CampsiteType>();

            try
            {
                // Try to find the type from the place-header-access figure
                var accessFigure = doc.DocumentNode.SelectSingleNode("//figure[@class='place-header-access']");

                if (accessFigure != null)
                {
                    var imgNode = accessFigure.SelectSingleNode(".//img");
                    if (imgNode != null)
                    {
                        string? typeName = null;
                        string? svgUrl = null;
                        string? svgContent = null;

                        // Method 1: Try to get alt attribute from img tag
                        var altText = imgNode.GetAttributeValue("alt", "");
                        if (!string.IsNullOrWhiteSpace(altText))
                        {
                            typeName = altText.Trim();
                            _logger.LogDebug("Found type from alt: {Type}", typeName);
                        }

                        // Get the image source (could be SVG or other formats)
                        var src = imgNode.GetAttributeValue("src", "");
                        if (!string.IsNullOrWhiteSpace(src))
                        {
                            // Check if it's an SVG file
                            if (src.EndsWith(".svg") || src.Contains(".svg?"))
                            {
                                svgUrl = src;
                                _logger.LogDebug("Found SVG URL from img src: {Url}", svgUrl);
                            }
                            else
                            {
                                _logger.LogDebug("Image source is not SVG: {Src}", src);
                            }
                        }

                        // Add the type if we found a name
                        if (!string.IsNullOrWhiteSpace(typeName))
                        {
                            var campsiteType = new CampsiteType
                            {
                                Name = typeName
                            };

                            // Try to save the SVG icon
                            if (!string.IsNullOrWhiteSpace(svgUrl))
                            {
                                // Download from URL
                                var iconPath = await DownloadTypeIconAsync(svgUrl, typeName, baseUrl);
                                campsiteType.IconPath = iconPath;
                            }
                            else if (!string.IsNullOrWhiteSpace(svgContent))
                            {
                                // Save inline SVG content
                                var iconPath = await SaveInlineSvgAsync(svgContent, typeName, "types");
                                campsiteType.IconPath = iconPath;
                            }

                            types.Add(campsiteType);
                        }
                    }
                }

                // Method 2: Try to get the SVG element directly (inline SVG)
                if (types.Count == 0)
                {
                    var svgNode = doc.DocumentNode.SelectSingleNode("//figure[@class='place-header-access']//svg");
                    if (svgNode != null)
                    {
                        string? typeName = null;
                        var svgContent = svgNode.OuterHtml;
                        _logger.LogDebug("Found inline SVG for type");

                        // Try to get xlink:href for logging and name extraction
                        var useNode = svgNode.SelectSingleNode(".//use");
                        if (useNode != null)
                        {
                            var xlinkHref = useNode.GetAttributeValue("xlink:href", "")
                                            ?? useNode.GetAttributeValue("href", "");

                            if (!string.IsNullOrWhiteSpace(xlinkHref))
                            {
                                var iconName = xlinkHref.TrimStart('#').Replace("icon-", "");
                                typeName = ConvertIconNameToReadable(iconName);
                                _logger.LogDebug("Found type from SVG: {Type} (from {XlinkHref})", typeName, xlinkHref);
                            }
                        }

                        if (!string.IsNullOrWhiteSpace(typeName))
                        {
                            var campsiteType = new CampsiteType
                            {
                                Name = typeName
                            };

                            var iconPath = await SaveInlineSvgAsync(svgContent, typeName, "types");
                            campsiteType.IconPath = iconPath;

                            types.Add(campsiteType);
                        }
                    }
                }

                // Fallback: Try alternative selectors
                if (types.Count == 0)
                {
                    var typeNode = doc.DocumentNode.SelectSingleNode("//span[@class='place-type']") ??
                                  doc.DocumentNode.SelectSingleNode("//*[contains(@class, 'category')]") ??
                                  doc.DocumentNode.SelectSingleNode("//*[contains(text(), 'Type')]/..//span");

                    var fallbackType = typeNode?.InnerText.Trim();

                    if (!string.IsNullOrWhiteSpace(fallbackType))
                    {
                        _logger.LogDebug("Extracted type using fallback: {Type}", fallbackType);
                        types.Add(new CampsiteType { Name = fallbackType });
                    }
                }

                _logger.LogInformation("Extracted {Count} types", types.Count);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Error extracting type");
            }

            return types.Where(t => !string.IsNullOrEmpty(t.Name)).Distinct(new CampsiteTypeComparer()).ToList();
        }

        // Comparer to ensure unique types by name
        private class CampsiteTypeComparer : IEqualityComparer<CampsiteType>
        {
            public bool Equals(CampsiteType? x, CampsiteType? y)
            {
                if (x == null || y == null) return false;
                return x.Name.Equals(y.Name, StringComparison.OrdinalIgnoreCase);
            }

            public int GetHashCode(CampsiteType obj)
            {
                return obj.Name.ToLower().GetHashCode();
            }
        }

        private async Task<List<CampsiteService>> ExtractServicesAsync(HtmlDocument doc, string baseUrl)
        {
            var services = new List<CampsiteService>();

            try
            {
                // Find the services section by looking for the caption containing "service"
                var servicesRow = doc.DocumentNode.SelectNodes("//div[@class='row align-items-center py-2']")?
                    .FirstOrDefault(row =>
                    {
                        var caption = row.SelectSingleNode(".//span[contains(@class, 'caption')]");
                        return caption != null && caption.InnerText.ToLower().Contains("service");
                    });

                if (servicesRow == null)
                {
                    _logger.LogWarning("Services section not found in HTML");
                    return services;
                }

                // Get the list items from the services section
                var serviceNodes = servicesRow.SelectNodes(".//ul[@class='place-specs-services']//li");

                if (serviceNodes != null)
                {
                    foreach (var node in serviceNodes)
                    {
                        string? serviceName = null;
                        string? svgUrl = null;
                        string? svgContent = null;

                        // Method 1: Try to get alt attribute from img tag
                        var imgNode = node.SelectSingleNode(".//img");
                        if (imgNode != null)
                        {
                            var altText = imgNode.GetAttributeValue("alt", "");
                            if (!string.IsNullOrWhiteSpace(altText))
                            {
                                serviceName = altText.Trim();
                                _logger.LogDebug("Found service from alt: {Service}", serviceName);
                            }

                            // Get the image source (could be SVG or other formats)
                            var src = imgNode.GetAttributeValue("src", "");
                            if (!string.IsNullOrWhiteSpace(src))
                            {
                                // Check if it's an SVG file
                                if (src.EndsWith(".svg") || src.Contains(".svg?"))
                                {
                                    svgUrl = src;
                                    _logger.LogDebug("Found SVG URL from img src: {Url}", svgUrl);
                                }
                                else
                                {
                                    _logger.LogDebug("Image source is not SVG: {Src}", src);
                                }
                            }
                        }

                        // Method 2: Try to get the SVG element directly (inline SVG)
                        if (string.IsNullOrEmpty(svgContent))
                        {
                            var svgNode = node.SelectSingleNode(".//svg");
                            if (svgNode != null)
                            {
                                // Get the outer HTML of the SVG element
                                svgContent = svgNode.OuterHtml;
                                _logger.LogDebug("Found inline SVG for service: {Service}", serviceName ?? "Unknown");

                                // Also try to get xlink:href for logging
                                var useNode = svgNode.SelectSingleNode(".//use");
                                if (useNode != null)
                                {
                                    var xlinkHref = useNode.GetAttributeValue("xlink:href", "")
                                                    ?? useNode.GetAttributeValue("href", "");

                                    if (!string.IsNullOrWhiteSpace(xlinkHref))
                                    {
                                        var iconName = xlinkHref.TrimStart('#').Replace("icon-", "");

                                        // If no service name yet, convert icon name to readable format
                                        if (string.IsNullOrWhiteSpace(serviceName))
                                        {
                                            serviceName = ConvertIconNameToReadable(iconName);
                                            _logger.LogDebug("Found service from SVG: {Service} (from {XlinkHref})", serviceName, xlinkHref);
                                        }
                                    }
                                }
                            }
                        }

                        // Method 3: Fallback to text content
                        if (string.IsNullOrWhiteSpace(serviceName))
                        {
                            var text = node.InnerText.Trim();
                            if (!string.IsNullOrWhiteSpace(text))
                            {
                                serviceName = text;
                                _logger.LogDebug("Found service from text: {Service}", serviceName);
                            }
                        }

                        // Add the service if we found a name
                        if (!string.IsNullOrWhiteSpace(serviceName))
                        {
                            var service = new CampsiteService
                            {
                                Name = serviceName
                            };

                            // Try to save the SVG icon
                            if (!string.IsNullOrWhiteSpace(svgUrl))
                            {
                                // Download from URL
                                var iconPath = await DownloadServiceIconAsync(svgUrl, serviceName, baseUrl);
                                service.IconPath = iconPath;
                            }
                            else if (!string.IsNullOrWhiteSpace(svgContent))
                            {
                                // Save inline SVG content
                                var iconPath = await SaveInlineSvgAsync(svgContent, serviceName, "services");
                                service.IconPath = iconPath;
                            }

                            services.Add(service);
                        }
                    }
                }

                _logger.LogInformation("Extracted {Count} services", services.Count);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Error extracting services");
            }

            return services.Where(s => !string.IsNullOrEmpty(s.Name)).Distinct(new CampsiteServiceComparer()).ToList();
        }

        // Comparer to ensure unique services by name
        private class CampsiteServiceComparer : IEqualityComparer<CampsiteService>
        {
            public bool Equals(CampsiteService? x, CampsiteService? y)
            {
                if (x == null || y == null) return false;
                return x.Name.Equals(y.Name, StringComparison.OrdinalIgnoreCase);
            }

            public int GetHashCode(CampsiteService obj)
            {
                return obj.Name.ToLower().GetHashCode();
            }
        }

        private async Task<List<CampsiteActivity>> ExtractActivitiesAsync(HtmlDocument doc, string baseUrl)
        {
            var activities = new List<CampsiteActivity>();

            try
            {
                // Find the activities section by looking for the caption containing "aktivitäten" or "activities"
                var activitiesRow = doc.DocumentNode.SelectNodes("//div[@class='row align-items-center py-2']")?
                    .FirstOrDefault(row =>
                    {
                        var caption = row.SelectSingleNode(".//span[contains(@class, 'caption')]");
                        if (caption == null) return false;

                        var text = caption.InnerText.ToLower();
                        return text.Contains("aktivitäten") || text.Contains("activities") ||
                               text.Contains("activités") || text.Contains("actividades");
                    });

                if (activitiesRow == null)
                {
                    _logger.LogWarning("Activities section not found in HTML");
                    return activities;
                }

                // Get the list items from the activities section
                var activityNodes = activitiesRow.SelectNodes(".//ul[@class='place-specs-services']//li");

                if (activityNodes != null)
                {
                    foreach (var node in activityNodes)
                    {
                        string? activityName = null;
                        string? svgUrl = null;
                        string? svgContent = null;

                        // Method 1: Try to get alt attribute from img tag
                        var imgNode = node.SelectSingleNode(".//img");
                        if (imgNode != null)
                        {
                            var altText = imgNode.GetAttributeValue("alt", "");
                            if (!string.IsNullOrWhiteSpace(altText))
                            {
                                activityName = altText.Trim();
                                _logger.LogDebug("Found activity from alt: {Activity}", activityName);
                            }

                            // Get the image source (could be SVG or other formats)
                            var src = imgNode.GetAttributeValue("src", "");
                            if (!string.IsNullOrWhiteSpace(src))
                            {
                                // Check if it's an SVG file
                                if (src.EndsWith(".svg") || src.Contains(".svg?"))
                                {
                                    svgUrl = src;
                                    _logger.LogDebug("Found SVG URL from img src: {Url}", svgUrl);
                                }
                                else
                                {
                                    _logger.LogDebug("Image source is not SVG: {Src}", src);
                                }
                            }
                        }

                        // Method 2: Try to get the SVG element directly (inline SVG)
                        if (string.IsNullOrEmpty(svgContent))
                        {
                            var svgNode = node.SelectSingleNode(".//svg");
                            if (svgNode != null)
                            {
                                // Get the outer HTML of the SVG element
                                svgContent = svgNode.OuterHtml;
                                _logger.LogDebug("Found inline SVG for activity: {Activity}", activityName ?? "Unknown");

                                // Also try to get xlink:href for logging
                                var useNode = svgNode.SelectSingleNode(".//use");
                                if (useNode != null)
                                {
                                    var xlinkHref = useNode.GetAttributeValue("xlink:href", "")
                                                    ?? useNode.GetAttributeValue("href", "");

                                    if (!string.IsNullOrWhiteSpace(xlinkHref))
                                    {
                                        var iconName = xlinkHref.TrimStart('#').Replace("icon-", "");

                                        // If no activity name yet, convert icon name to readable format
                                        if (string.IsNullOrWhiteSpace(activityName))
                                        {
                                            activityName = ConvertIconNameToReadable(iconName);
                                            _logger.LogDebug("Found activity from SVG: {Activity} (from {XlinkHref})", activityName, xlinkHref);
                                        }
                                    }
                                }
                            }
                        }

                        // Method 3: Fallback to text content
                        if (string.IsNullOrWhiteSpace(activityName))
                        {
                            var text = node.InnerText.Trim();
                            if (!string.IsNullOrWhiteSpace(text))
                            {
                                activityName = text;
                                _logger.LogDebug("Found activity from text: {Activity}", activityName);
                            }
                        }

                        // Add the activity if we found a name
                        if (!string.IsNullOrWhiteSpace(activityName))
                        {
                            var activity = new CampsiteActivity
                            {
                                Name = activityName
                            };

                            // Try to save the SVG icon
                            if (!string.IsNullOrWhiteSpace(svgUrl))
                            {
                                // Download from URL
                                var iconPath = await DownloadActivityIconAsync(svgUrl, activityName, baseUrl);
                                activity.IconPath = iconPath;
                            }
                            else if (!string.IsNullOrWhiteSpace(svgContent))
                            {
                                // Save inline SVG content
                                var iconPath = await SaveInlineSvgAsync(svgContent, activityName, "activities");
                                activity.IconPath = iconPath;
                            }

                            activities.Add(activity);
                        }
                    }
                }

                _logger.LogInformation("Extracted {Count} activities", activities.Count);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Error extracting activities");
            }

            return activities.Where(a => !string.IsNullOrEmpty(a.Name)).Distinct(new CampsiteActivityComparer()).ToList();
        }

        // Helper method to convert icon names to readable format
        private string ConvertIconNameToReadable(string iconName)
        {
            // Remove common prefixes and convert to Title Case
            iconName = iconName.Replace("-", " ").Replace("_", " ").Trim();

            // Capitalize first letter of each word
            if (!string.IsNullOrWhiteSpace(iconName))
            {
                var words = iconName.Split(' ');
                for (int i = 0; i < words.Length; i++)
                {
                    if (words[i].Length > 0)
                    {
                        words[i] = char.ToUpper(words[i][0]) + words[i].Substring(1).ToLower();
                    }
                }
                iconName = string.Join(" ", words);
            }

            return iconName;
        }

        // Comparer to ensure unique activities by name
        private class CampsiteActivityComparer : IEqualityComparer<CampsiteActivity>
        {
            public bool Equals(CampsiteActivity? x, CampsiteActivity? y)
            {
                if (x == null || y == null) return false;
                return x.Name.Equals(y.Name, StringComparison.OrdinalIgnoreCase);
            }

            public int GetHashCode(CampsiteActivity obj)
            {
                return obj.Name.ToLower().GetHashCode();
            }
        }

        private string? ExtractPrice(HtmlDocument doc)
        {
            try
            {
                var prices = new List<string>();

                // Try to extract from place-info-details definition list
                var detailsList = doc.DocumentNode.SelectSingleNode("//dl[contains(@class, 'place-info-details')]");
                if (detailsList != null)
                {
                    var dtNodes = detailsList.SelectNodes(".//dt");
                    if (dtNodes != null)
                    {
                        foreach (var dt in dtNodes)
                        {
                            var dtText = dt.InnerText.Trim().ToLower();

                            // Check for service price in multiple languages
                            bool isServicePrice = dtText.Contains("preis der dienstleistungen") ||   // German
                                                 dtText.Contains("price of services") ||              // English
                                                 dtText.Contains("prix des services") ||              // French
                                                 dtText.Contains("precio de los servicios");         // Spanish

                            // Check for parking cost in multiple languages
                            bool isParkingCost = dtText.Contains("parkgebühren") ||                  // German
                                                dtText.Contains("parking cost") ||                   // English
                                                dtText.Contains("frais de parking") ||               // French
                                                dtText.Contains("coste de aparcamiento");            // Spanish

                            if (isServicePrice || isParkingCost)
                            {
                                // Get the next sibling <dd> element
                                var dd = dt.NextSibling;
                                while (dd != null && dd.Name != "dd")
                                {
                                    dd = dd.NextSibling;
                                }

                                if (dd != null)
                                {
                                    var priceValue = dd.InnerText.Trim();
                                    if (!string.IsNullOrWhiteSpace(priceValue))
                                    {
                                        // Add label for clarity
                                        string label = isServicePrice ? "Services" : "Parking";
                                        prices.Add($"{label}: {priceValue}");
                                        _logger.LogDebug("Extracted {Label} price: {Price}", label, priceValue);
                                    }
                                }
                            }
                        }
                    }
                }

                // If we found prices, combine them
                if (prices.Count > 0)
                {
                    var combinedPrice = string.Join(", ", prices);

                    // Truncate to database max length (200)
                    if (combinedPrice.Length > 200)
                    {
                        _logger.LogWarning("Price field truncated from {Length} to 200 characters", combinedPrice.Length);
                        combinedPrice = combinedPrice.Substring(0, 200);
                    }

                    _logger.LogInformation("Extracted price: {Price}", combinedPrice);
                    return combinedPrice;
                }

                // Fallback: Try to find any price-related node
                var priceNode = doc.DocumentNode.SelectSingleNode("//*[contains(@class, 'price')]") ??
                               doc.DocumentNode.SelectSingleNode("//*[contains(text(), 'Price')]/..//span");

                if (priceNode != null)
                {
                    var price = priceNode.InnerText.Trim();

                    if (!string.IsNullOrWhiteSpace(price))
                    {
                        // Truncate to database max length (200)
                        if (price.Length > 200)
                        {
                            _logger.LogWarning("Price field truncated from {Length} to 200 characters", price.Length);
                            price = price.Substring(0, 200);
                        }

                        _logger.LogInformation("Extracted price from fallback: {Price}", price);
                        return price;
                    }
                }

                _logger.LogDebug("Could not extract price");
                return null;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Error extracting price");
                return null;
            }
        }

        private int? ExtractNumberOfSpots(HtmlDocument doc)
        {
            try
            {
                // Method 1: Try to extract from place-info-details definition list
                var detailsList = doc.DocumentNode.SelectSingleNode("//dl[contains(@class, 'place-info-details')]");
                if (detailsList != null)
                {
                    var dtNodes = detailsList.SelectNodes(".//dt");
                    if (dtNodes != null)
                    {
                        foreach (var dt in dtNodes)
                        {
                            var dtText = dt.InnerText.Trim().ToLower();
                            // Check for multiple language variants
                            if (dtText.Contains("anzahl der plätze") ||      // German
                                dtText.Contains("number of places") ||        // English
                                dtText.Contains("nombre de places") ||        // French
                                dtText.Contains("número de lugares"))         // Spanish
                            {
                                // Get the next sibling <dd> element
                                var dd = dt.NextSibling;
                                while (dd != null && dd.Name != "dd")
                                {
                                    dd = dd.NextSibling;
                                }

                                if (dd != null)
                                {
                                    var spotsText = Regex.Match(dd.InnerText, @"(\d+)").Value;
                                    if (int.TryParse(spotsText, out var spots))
                                    {
                                        _logger.LogInformation("Extracted number of spots from place-info-details: {Spots}", spots);
                                        return spots;
                                    }
                                }
                            }
                        }
                    }
                }

                // Method 2: Fallback to searching for text containing spots/places
                var spotsNode = doc.DocumentNode.SelectSingleNode("//*[contains(text(), 'spots')]") ??
                               doc.DocumentNode.SelectSingleNode("//*[contains(text(), 'places')]");

                if (spotsNode != null)
                {
                    var spotsText = Regex.Match(spotsNode.InnerText, @"(\d+)").Value;
                    if (int.TryParse(spotsText, out var spots))
                    {
                        _logger.LogInformation("Extracted number of spots from text fallback: {Spots}", spots);
                        return spots;
                    }
                }

                _logger.LogDebug("Could not extract number of spots");
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Error extracting number of spots");
            }

            return null;
        }

        private Dictionary<string, string> ExtractDescriptions(HtmlDocument doc)
        {
            var descriptions = new Dictionary<string, string>();

            try
            {
                // First, try to find the multi-language description container
                var descContainer = doc.DocumentNode.SelectSingleNode("//div[@class='place-info-description']") ??
                                   doc.DocumentNode.SelectSingleNode("//div[contains(@class, 'place-description')]") ??
                                   doc.DocumentNode.SelectSingleNode("//div[contains(@class, 'description')]");

                if (descContainer != null)
                {
                    // Try to find paragraphs with language attributes
                    var descNodesWithLang = descContainer.SelectNodes(".//p[@lang]");

                    if (descNodesWithLang != null && descNodesWithLang.Count > 0)
                    {
                        foreach (var node in descNodesWithLang)
                        {
                            var lang = node.GetAttributeValue("lang", null);
                            var text = node.InnerText.Trim();

                            if (!string.IsNullOrWhiteSpace(lang) && !string.IsNullOrWhiteSpace(text))
                            {
                                descriptions[lang] = text;
                                _logger.LogInformation("Extracted description for language: {Language}", lang);
                            }
                        }
                    }
                    else
                    {
                        // Fallback: If no language-specific paragraphs, extract all text
                        // and try to detect language from URL or use a default language
                        var allText = descContainer.InnerText.Trim();
                        if (!string.IsNullOrWhiteSpace(allText))
                        {
                            // Default to English or detect from context
                            descriptions["en"] = allText;
                            _logger.LogInformation("Extracted single description (defaulting to 'en')");
                        }
                    }
                }

                // If still no descriptions found, try alternative selectors
                if (descriptions.Count == 0)
                {
                    var descNode = doc.DocumentNode.SelectSingleNode("//div[@class='description']//p") ??
                                  doc.DocumentNode.SelectSingleNode("//*[contains(@class, 'description')]");

                    if (descNode != null)
                    {
                        var text = descNode.InnerText.Trim();
                        if (!string.IsNullOrWhiteSpace(text))
                        {
                            descriptions["en"] = text;
                            _logger.LogInformation("Extracted fallback description");
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Error extracting descriptions");
            }

            return descriptions;
        }

        private List<string> ExtractImageUrls(HtmlDocument doc, string baseUrl)
{
    var imageUrls = new List<string>();

    try
    {
        // Target ONLY the campsite gallery images
        var galleryLinks = doc.DocumentNode.SelectNodes("//a[contains(@class, 'place-header-gallery-image')]");

            if (galleryLinks != null)
            {
                foreach (var link in galleryLinks)
                {
                    // Get href from the link (full-size image)
                    var href = link.GetAttributeValue("href", "");
                    
                    if (!string.IsNullOrWhiteSpace(href))
                    {
                        // Convert relative URLs to absolute
                        if (href.StartsWith("//"))
                            href = "https:" + href;
                        else if (href.StartsWith("/"))
                            href = new Uri(new Uri(baseUrl), href).ToString();
                        
                        imageUrls.Add(href);
                    }
                    else
                    {
                        // Fallback: try to get src from img inside the link
                        var img = link.SelectSingleNode(".//img");
                        if (img != null)
                        {
                            var src = img.GetAttributeValue("src", "");
                            
                            if (!string.IsNullOrWhiteSpace(src))
                            {
                                if (src.StartsWith("//"))
                                    src = "https:" + src;
                                else if (src.StartsWith("/"))
                                    src = new Uri(new Uri(baseUrl), src).ToString();
                                
                                imageUrls.Add(src);
                            }
                        }
                    }
                }
            }
            
            _logger.LogInformation("Extracted {Count} gallery images", imageUrls.Count);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error extracting image URLs");
        }

        return imageUrls.Distinct().ToList();
    }

        private async Task<List<string>> DownloadImagesAsync(List<string> imageUrls, string park4NightId)
        {
            var savedPaths = new List<string>();

            for (int i = 0; i < imageUrls.Count; i++)
            {
                try
                {
                    var imageUrl = imageUrls[i];
                    var extension = Path.GetExtension(new Uri(imageUrl).AbsolutePath);
                    if (string.IsNullOrEmpty(extension))
                        extension = ".jpg";

                    var fileName = $"{park4NightId}_{i + 1}{extension}";
                    var filePath = Path.Combine(_imagesBasePath, fileName);

                    // Download image
                    var imageBytes = await _httpClient.GetByteArrayAsync(imageUrl);
                    await File.WriteAllBytesAsync(filePath, imageBytes);

                    // Store relative path for database
                    savedPaths.Add($"/images/campsites/{fileName}");

                    _logger.LogInformation("Downloaded image {Index}/{Total} for campsite {Id}", i + 1, imageUrls.Count, park4NightId);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Error downloading image {Index} from {Url}", i, imageUrls[i]);
                }
            }

            return savedPaths;
        }

        private async Task<string?> DownloadActivityIconAsync(string svgUrl, string activityName, string baseUrl)
        {
            try
            {
                // Sanitize activity name for filename
                var safeFileName = string.Join("_", activityName.Split(Path.GetInvalidFileNameChars()));
                safeFileName = safeFileName.ToLower().Replace(" ", "_");

                // If URL is relative, convert to absolute
                if (svgUrl.StartsWith("//"))
                {
                    svgUrl = "https:" + svgUrl;
                }
                else if (svgUrl.StartsWith("/"))
                {
                    svgUrl = new Uri(new Uri(baseUrl), svgUrl).ToString();
                }
                else if (svgUrl.StartsWith("#"))
                {
                    // This is a reference to an SVG sprite, we can't download it directly
                    _logger.LogDebug("Skipping SVG sprite reference: {SvgUrl}", svgUrl);
                    return null;
                }

                // Only proceed if it's an SVG file
                if (!svgUrl.EndsWith(".svg") && !svgUrl.Contains(".svg?"))
                {
                    _logger.LogDebug("URL is not an SVG file: {SvgUrl}", svgUrl);
                    return null;
                }

                var fileName = $"{safeFileName}.svg";
                var filePath = Path.Combine(_activitiesBasePath, fileName);

                // Download SVG file
                var svgContent = await _httpClient.GetStringAsync(svgUrl);
                await File.WriteAllTextAsync(filePath, svgContent);

                // Return relative path for database
                var relativePath = $"/images/campsites/activities/{fileName}";
                _logger.LogInformation("Downloaded activity icon: {Activity} to {Path}", activityName, relativePath);

                return relativePath;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Error downloading activity icon for {Activity} from {Url}", activityName, svgUrl);
                return null;
            }
        }

        private async Task<string?> SaveInlineSvgAsync(string svgContent, string itemName, string folderType)
        {
            try
            {
                // Sanitize item name for filename
                var safeFileName = string.Join("_", itemName.Split(Path.GetInvalidFileNameChars()));
                safeFileName = safeFileName.ToLower().Replace(" ", "_");

                var fileName = $"{safeFileName}.svg";
                var basePath = folderType == "services" ? _servicesBasePath : _activitiesBasePath;
                var filePath = Path.Combine(basePath, fileName);

                // Save inline SVG content to file
                await File.WriteAllTextAsync(filePath, svgContent);

                // Return relative path for database
                var relativePath = $"/images/campsites/{folderType}/{fileName}";
                _logger.LogInformation("Saved inline SVG icon: {Item} to {Path}", itemName, relativePath);

                return relativePath;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Error saving inline SVG icon for {Item}", itemName);
                return null;
            }
        }

        private async Task<string?> DownloadServiceIconAsync(string svgUrl, string serviceName, string baseUrl)
        {
            try
            {
                // Sanitize service name for filename
                var safeFileName = string.Join("_", serviceName.Split(Path.GetInvalidFileNameChars()));
                safeFileName = safeFileName.ToLower().Replace(" ", "_");

                // If URL is relative, convert to absolute
                if (svgUrl.StartsWith("//"))
                {
                    svgUrl = "https:" + svgUrl;
                }
                else if (svgUrl.StartsWith("/"))
                {
                    svgUrl = new Uri(new Uri(baseUrl), svgUrl).ToString();
                }
                else if (svgUrl.StartsWith("#"))
                {
                    // This is a reference to an SVG sprite, we can't download it directly
                    _logger.LogDebug("Skipping SVG sprite reference: {SvgUrl}", svgUrl);
                    return null;
                }

                // Only proceed if it's an SVG file
                if (!svgUrl.EndsWith(".svg") && !svgUrl.Contains(".svg?"))
                {
                    _logger.LogDebug("URL is not an SVG file: {SvgUrl}", svgUrl);
                    return null;
                }

                var fileName = $"{safeFileName}.svg";
                var filePath = Path.Combine(_servicesBasePath, fileName);

                // Download SVG file
                var svgContent = await _httpClient.GetStringAsync(svgUrl);
                await File.WriteAllTextAsync(filePath, svgContent);

                // Return relative path for database
                var relativePath = $"/images/campsites/services/{fileName}";
                _logger.LogInformation("Downloaded service icon: {Service} to {Path}", serviceName, relativePath);

                return relativePath;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Error downloading service icon for {Service} from {Url}", serviceName, svgUrl);
                return null;
            }
        }

        private async Task<string?> DownloadTypeIconAsync(string svgUrl, string typeName, string baseUrl)
        {
            try
            {
                // Sanitize type name for filename
                var safeFileName = string.Join("_", typeName.Split(Path.GetInvalidFileNameChars()));
                safeFileName = safeFileName.ToLower().Replace(" ", "_");

                // If URL is relative, convert to absolute
                if (svgUrl.StartsWith("//"))
                {
                    svgUrl = "https:" + svgUrl;
                }
                else if (svgUrl.StartsWith("/"))
                {
                    svgUrl = new Uri(new Uri(baseUrl), svgUrl).ToString();
                }
                else if (svgUrl.StartsWith("#"))
                {
                    // This is a reference to an SVG sprite, we can't download it directly
                    _logger.LogDebug("Skipping SVG sprite reference: {SvgUrl}", svgUrl);
                    return null;
                }

                // Only proceed if it's an SVG file
                if (!svgUrl.EndsWith(".svg") && !svgUrl.Contains(".svg?"))
                {
                    _logger.LogDebug("URL is not an SVG file: {SvgUrl}", svgUrl);
                    return null;
                }

                var fileName = $"{safeFileName}.svg";
                var filePath = Path.Combine(_typesBasePath, fileName);

                // Download SVG file
                var svgContent = await _httpClient.GetStringAsync(svgUrl);
                await File.WriteAllTextAsync(filePath, svgContent);

                // Return relative path for database
                var relativePath = $"/images/campsites/types/{fileName}";
                _logger.LogInformation("Downloaded type icon: {Type} to {Path}", typeName, relativePath);

                return relativePath;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Error downloading type icon for {Type} from {Url}", typeName, svgUrl);
                return null;
            }
        }
    }
}
