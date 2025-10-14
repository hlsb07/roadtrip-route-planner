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
        private readonly GeometryFactory _geometryFactory;

        public Park4NightScraperService(
            HttpClient httpClient,
            ILogger<Park4NightScraperService> logger,
            IWebHostEnvironment env)
        {
            _httpClient = httpClient;
            _logger = logger;
            _imagesBasePath = Path.Combine(env.WebRootPath ?? "wwwroot", "images", "campsites");
            _activitiesBasePath = Path.Combine(env.WebRootPath ?? "wwwroot", "images", "campsites", "activities");
            _geometryFactory = new GeometryFactory(new PrecisionModel(), 4326);

            // Ensure directories exist
            Directory.CreateDirectory(_imagesBasePath);
            Directory.CreateDirectory(_activitiesBasePath);

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
                    Park4NightId = park4NightId,
                    SourceUrl = url,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                };

                // Extract data from HTML
                campsite.Name = ExtractName(htmlDoc);
                var (lat, lon) = ExtractCoordinates(htmlDoc);
                campsite.Location = _geometryFactory.CreatePoint(new Coordinate(lon, lat));
                campsite.Rating = ExtractRating(htmlDoc);
                campsite.Type = ExtractType(htmlDoc);

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

        private string ExtractPark4NightId(string url)
        {
            // Extract ID from URL like https://park4night.com/de/place/561613
            var match = Regex.Match(url, @"/place/(\d+)");
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
                // Look for coordinates in data attributes or meta tags
                var coordNode = doc.DocumentNode.SelectSingleNode("//meta[@property='place:location:latitude']");
                var latNode = doc.DocumentNode.SelectSingleNode("//meta[@property='place:location:latitude']");
                var lonNode = doc.DocumentNode.SelectSingleNode("//meta[@property='place:location:longitude']");

                if (latNode != null && lonNode != null)
                {
                    var lat = double.Parse(latNode.GetAttributeValue("content", "0"), System.Globalization.CultureInfo.InvariantCulture);
                    var lon = double.Parse(lonNode.GetAttributeValue("content", "0"), System.Globalization.CultureInfo.InvariantCulture);
                    return (lat, lon);
                }

                // Try extracting from JavaScript/JSON-LD
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
                                return (lat, lon);
                            }
                        }
                        catch { }
                    }
                }

                // Fallback: try to find in data-lat and data-lng attributes
                var mapNode = doc.DocumentNode.SelectSingleNode("//*[@data-lat]");
                if (mapNode != null)
                {
                    var lat = double.Parse(mapNode.GetAttributeValue("data-lat", "0"), System.Globalization.CultureInfo.InvariantCulture);
                    var lon = double.Parse(mapNode.GetAttributeValue("data-lng", "0"), System.Globalization.CultureInfo.InvariantCulture);
                    return (lat, lon);
                }
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

        private string? ExtractType(HtmlDocument doc)
        {
            try
            {
                var typeNode = doc.DocumentNode.SelectSingleNode("//span[@class='place-type']") ??
                              doc.DocumentNode.SelectSingleNode("//*[contains(@class, 'category')]") ??
                              doc.DocumentNode.SelectSingleNode("//*[contains(text(), 'Type')]/..//span");

                var type = typeNode?.InnerText.Trim();

                // Truncate to database max length (200)
                if (type?.Length > 200)
                {
                    _logger.LogWarning("Type field truncated from {Length} to 200 characters", type.Length);
                    return type.Substring(0, 200);
                }

                return type;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Error extracting type");
                return null;
            }
        }

        private async Task<List<CampsiteService>> ExtractServicesAsync(HtmlDocument doc, string baseUrl)
        {
            var services = new List<CampsiteService>();

            try
            {
                // Target the specific list with services (same as activities)
                var serviceNodes = doc.DocumentNode.SelectNodes("//ul[@class='place-specs-services']//li");

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
                                var iconPath = await DownloadActivityIconAsync(svgUrl, serviceName, baseUrl);
                                service.IconPath = iconPath;
                            }
                            else if (!string.IsNullOrWhiteSpace(svgContent))
                            {
                                // Save inline SVG content
                                var iconPath = await SaveInlineSvgAsync(svgContent, serviceName);
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
                // Target the specific list with activities
                var activityNodes = doc.DocumentNode.SelectNodes("//ul[@class='place-specs-services']//li");

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
                                var iconPath = await SaveInlineSvgAsync(svgContent, activityName);
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
                var priceNode = doc.DocumentNode.SelectSingleNode("//*[contains(@class, 'price')]") ??
                               doc.DocumentNode.SelectSingleNode("//*[contains(text(), 'Price')]/..//span") ??
                               doc.DocumentNode.SelectSingleNode("//*[contains(text(), '€')]") ??
                               doc.DocumentNode.SelectSingleNode("//*[contains(text(), '$')]");

                var price = priceNode?.InnerText.Trim();

                // Truncate to database max length (200)
                if (price?.Length > 200)
                {
                    _logger.LogWarning("Price field truncated from {Length} to 200 characters", price.Length);
                    return price.Substring(0, 200);
                }

                return price;
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
                var spotsNode = doc.DocumentNode.SelectSingleNode("//*[contains(text(), 'spots')]") ??
                               doc.DocumentNode.SelectSingleNode("//*[contains(text(), 'places')]");

                if (spotsNode != null)
                {
                    var spotsText = Regex.Match(spotsNode.InnerText, @"(\d+)").Value;
                    if (int.TryParse(spotsText, out var spots))
                    {
                        return spots;
                    }
                }
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

        private async Task<string?> SaveInlineSvgAsync(string svgContent, string activityName)
        {
            try
            {
                // Sanitize activity name for filename
                var safeFileName = string.Join("_", activityName.Split(Path.GetInvalidFileNameChars()));
                safeFileName = safeFileName.ToLower().Replace(" ", "_");

                var fileName = $"{safeFileName}.svg";
                var filePath = Path.Combine(_activitiesBasePath, fileName);

                // Save inline SVG content to file
                await File.WriteAllTextAsync(filePath, svgContent);

                // Return relative path for database
                var relativePath = $"/images/campsites/activities/{fileName}";
                _logger.LogInformation("Saved inline SVG icon: {Activity} to {Path}", activityName, relativePath);

                return relativePath;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Error saving inline SVG icon for {Activity}", activityName);
                return null;
            }
        }
    }
}
