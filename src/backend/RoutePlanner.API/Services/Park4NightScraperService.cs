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
        private readonly GeometryFactory _geometryFactory;

        public Park4NightScraperService(
            HttpClient httpClient,
            ILogger<Park4NightScraperService> logger,
            IWebHostEnvironment env)
        {
            _httpClient = httpClient;
            _logger = logger;
            _imagesBasePath = Path.Combine(env.WebRootPath ?? "wwwroot", "images", "campsites");
            _geometryFactory = new GeometryFactory(new PrecisionModel(), 4326);

            // Ensure images directory exists
            Directory.CreateDirectory(_imagesBasePath);

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
                campsite.Services = JsonSerializer.Serialize(ExtractServices(htmlDoc));
                campsite.Activities = JsonSerializer.Serialize(ExtractActivities(htmlDoc));
                campsite.Price = ExtractPrice(htmlDoc);
                campsite.NumberOfSpots = ExtractNumberOfSpots(htmlDoc);
                campsite.Description = ExtractDescription(htmlDoc);

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

        private List<string> ExtractServices(HtmlDocument doc)
        {
            var services = new List<string>();

            try
            {
                // Look for service icons or list items
                var serviceNodes = doc.DocumentNode.SelectNodes("//ul[@class='services-list']//li") ??
                                  doc.DocumentNode.SelectNodes("//*[contains(@class, 'service')]") ??
                                  doc.DocumentNode.SelectNodes("//*[contains(@class, 'amenity')]");

                if (serviceNodes != null)
                {
                    foreach (var node in serviceNodes)
                    {
                        var service = node.InnerText.Trim();
                        if (!string.IsNullOrWhiteSpace(service))
                        {
                            services.Add(service);
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Error extracting services");
            }

            return services;
        }

        private List<string> ExtractActivities(HtmlDocument doc)
        {
            var activities = new List<string>();

            try
            {
                var activityNodes = doc.DocumentNode.SelectNodes("//ul[@class='activities-list']//li") ??
                                   doc.DocumentNode.SelectNodes("//*[contains(@class, 'activity')]");

                if (activityNodes != null)
                {
                    foreach (var node in activityNodes)
                    {
                        var activity = node.InnerText.Trim();
                        if (!string.IsNullOrWhiteSpace(activity))
                        {
                            activities.Add(activity);
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Error extracting activities");
            }

            return activities;
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

        private string? ExtractDescription(HtmlDocument doc)
        {
            try
            {
                var descNode = doc.DocumentNode.SelectSingleNode("//div[@class='description']") ??
                              doc.DocumentNode.SelectSingleNode("//div[@class='place-description']") ??
                              doc.DocumentNode.SelectSingleNode("//*[contains(@class, 'description')]//p");

                return descNode?.InnerText.Trim();
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Error extracting description");
                return null;
            }
        }

        private List<string> ExtractImageUrls(HtmlDocument doc, string baseUrl)
        {
            var imageUrls = new List<string>();

            try
            {
                // Look for image elements
                var imgNodes = doc.DocumentNode.SelectNodes("//img[contains(@class, 'place-image')]") ??
                              doc.DocumentNode.SelectNodes("//div[@class='gallery']//img") ??
                              doc.DocumentNode.SelectNodes("//img[contains(@src, 'park4night')]");

                if (imgNodes != null)
                {
                    foreach (var img in imgNodes)
                    {
                        var src = img.GetAttributeValue("src", "") ??
                                 img.GetAttributeValue("data-src", "");

                        if (!string.IsNullOrWhiteSpace(src))
                        {
                            // Convert relative URLs to absolute
                            if (src.StartsWith("//"))
                                src = "https:" + src;
                            else if (src.StartsWith("/"))
                                src = new Uri(new Uri(baseUrl), src).ToString();

                            // Skip tiny thumbnails or icons
                            if (!src.Contains("icon") && !src.Contains("thumb"))
                            {
                                imageUrls.Add(src);
                            }
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Error extracting image URLs");
            }

            return imageUrls.Distinct().Take(10).ToList(); // Limit to 10 images
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
    }
}
