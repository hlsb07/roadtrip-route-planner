using HtmlAgilityPack;
using NetTopologySuite.Geometries;
using RoutePlanner.API.Models;
using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace RoutePlanner.API.Services
{
    public class CamperMateScraperService
    {
        private readonly HttpClient _httpClient;
        private readonly ILogger<CamperMateScraperService> _logger;
        private readonly string _imagesBasePath;
        private readonly GeometryFactory _geometryFactory;

        public CamperMateScraperService(
            HttpClient httpClient,
            ILogger<CamperMateScraperService> logger,
            IWebHostEnvironment env)
        {
            _httpClient = httpClient;
            _logger = logger;

            // Use separate directory for CamperMate images
            var projectRoot = Path.GetFullPath(Path.Combine(env.ContentRootPath, "..", "..", "shared"));
            var sharedImagesPath = Path.Combine(projectRoot, "images", "campermate");

            _imagesBasePath = sharedImagesPath;
            _geometryFactory = new GeometryFactory(new PrecisionModel(), 4326);

            Directory.CreateDirectory(_imagesBasePath);
            _logger.LogInformation("Using CamperMate images directory: {Path}", _imagesBasePath);

            // Configure HttpClient
            if (!_httpClient.DefaultRequestHeaders.UserAgent.Any())
            {
                _httpClient.DefaultRequestHeaders.Add(
                    "User-Agent",
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");
            }
        }

        /// <summary>
        /// Scrapes campsite data from a CamperMate URL
        /// Example: https://campermate.com/en/location/.../<uuid>
        /// </summary>
        public async Task<Campsite?> ScrapeCampsiteAsync(string url)
        {
            try
            {
                _logger.LogInformation("Starting to scrape CamperMate URL: {Url}", url);

                var camperMateUuid = ExtractCamperMateUuid(url);
                if (string.IsNullOrWhiteSpace(camperMateUuid))
                {
                    _logger.LogError("Could not extract CamperMate UUID from URL: {Url}", url);
                    return null;
                }

                var html = await _httpClient.GetStringAsync(url);

                var doc = new HtmlDocument();
                doc.LoadHtml(html);

                var campsite = new Campsite
                {
                    Source = CampsiteSource.CamperMate,
                    CamperMateId = camperMateUuid,
                    Park4NightId = null, // Not applicable for CamperMate
                    SourceUrl = url.Length > 500 ? url.Substring(0, 500) : url,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                };

                // Name
                campsite.Name = ExtractName(doc);

                // Coordinates
                var (lat, lon) = ExtractCoordinates(doc, html);
                campsite.Location = _geometryFactory.CreatePoint(new Coordinate(lon, lat));

                // Rating
                campsite.Rating = ExtractRating(doc, html);

                // Price
                campsite.Price = ExtractPrice(doc, html);

                // Number of spots: not reliably present on CamperMate pages
                campsite.NumberOfSpots = null;

                // Descriptions: prefer visible About section (Poi_aboutSection__...)
                var descriptions = ExtractDescriptionsFromAbout(doc);
                if (descriptions.Count == 0)
                {
                    // fallback: JSON-LD description
                    var ldDesc = TryExtractJsonLdDescription(doc);
                    if (!string.IsNullOrWhiteSpace(ldDesc))
                        descriptions["en"] = ldDesc;
                }
                campsite.DescriptionsDict = descriptions.Count > 0 ? descriptions : null;

                // Amenities: prefer "features" (Next data) -> categories; fallback to JSON-LD amenityFeature; fallback to DOM under Amenities
                var (types, services) = ExtractAmenities(doc, html);

                // Free/Paid campsite type: URL-first (stable), DOM-fallback
                var freePaidType = ExtractFreePaidTypeFromUrl(url) ?? ExtractFreePaidType(doc);
                if (!string.IsNullOrWhiteSpace(freePaidType))
                {
                    // Add to types list, avoiding duplicates
                    if (!types.Any(t => t.Name.Equals(freePaidType, StringComparison.OrdinalIgnoreCase)))
                    {
                        types.Insert(0, new CampsiteType { Name = freePaidType });
                    }
                }

                campsite.TypesList = types.Count > 0 ? types : null;
                campsite.ServicesList = services.Count > 0 ? services : null;

                // CamperMate has no "activities" section like Park4Night
                campsite.ActivitiesList = null;

                // Images
                var imageUrls = ExtractImageUrls(doc, html);
                var imagePaths = await DownloadImagesAsync(imageUrls, camperMateUuid);
                campsite.ImagePaths = JsonSerializer.Serialize(imagePaths);

                _logger.LogInformation(
                    "Successfully scraped CamperMate campsite: {Name} (UUID: {Uuid})",
                    campsite.Name,
                    camperMateUuid);

                return campsite;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error scraping CamperMate URL: {Url}", url);
                return null;
            }
        }

        // ----------------------------
        // Core extractors
        // ----------------------------

        private static string ExtractCamperMateUuid(string url)
        {
            // UUID at end of URL
            var m = Regex.Match(url,
                @"([0-9a-fA-F]{8}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{12})(?:\b|/|$)");
            return m.Success ? m.Groups[1].Value : string.Empty;
        }

        private string ExtractName(HtmlDocument doc)
        {
            var h1 = doc.DocumentNode.SelectSingleNode("//h1");
            var name = h1 != null ? HtmlEntity.DeEntitize(h1.InnerText).Trim() : "Unknown Campsite";

            if (string.IsNullOrWhiteSpace(name))
                name = "Unknown Campsite";

            if (name.Length > 300)
            {
                _logger.LogWarning("Name field truncated from {Length} to 300 characters", name.Length);
                name = name.Substring(0, 300);
            }

            return name;
        }

        private (double lat, double lon) ExtractCoordinates(HtmlDocument doc, string html)
        {
            // 1) JSON-LD geo (best)
            var (latLd, lonLd) = TryExtractCoordinatesFromJsonLd(doc);
            if (!double.IsNaN(latLd) && !double.IsNaN(lonLd))
                return (latLd, lonLd);

            // 2) Next data: "location":[lat,lon] (best effort)
            var mLoc = Regex.Match(html,
                "\"location\"\\s*:\\s*\\[\\s*(?<lat>-?\\d+(?:\\.\\d+)?)\\s*,\\s*(?<lon>-?\\d+(?:\\.\\d+)?)\\s*\\]",
                RegexOptions.IgnoreCase);
            if (mLoc.Success &&
                double.TryParse(mLoc.Groups["lat"].Value, NumberStyles.Float, CultureInfo.InvariantCulture, out var lat2) &&
                double.TryParse(mLoc.Groups["lon"].Value, NumberStyles.Float, CultureInfo.InvariantCulture, out var lon2))
            {
                return (lat2, lon2);
            }

            // 3) Fallback: google directions link destination=lat,lon
            var a = doc.DocumentNode.SelectSingleNode("//a[contains(@href,'google.com/maps/dir/?api=1') and contains(@href,'destination=')]");
            var href = a?.GetAttributeValue("href", null);

            if (!string.IsNullOrWhiteSpace(href))
            {
                var dest = GetQueryParam(href, "destination");
                if (!string.IsNullOrWhiteSpace(dest))
                {
                    dest = Uri.UnescapeDataString(dest);
                    var parts = dest.Split(',');
                    if (parts.Length == 2 &&
                        double.TryParse(parts[0], NumberStyles.Float, CultureInfo.InvariantCulture, out var lat3) &&
                        double.TryParse(parts[1], NumberStyles.Float, CultureInfo.InvariantCulture, out var lon3))
                    {
                        return (lat3, lon3);
                    }
                }
            }

            _logger.LogWarning("Could not extract coordinates; defaulting to 0,0");
            return (0, 0);
        }

        private (double lat, double lon) TryExtractCoordinatesFromJsonLd(HtmlDocument doc)
        {
            try
            {
                var scripts = doc.DocumentNode.SelectNodes("//script[@type='application/ld+json']");
                if (scripts == null) return (double.NaN, double.NaN);

                foreach (var s in scripts)
                {
                    var json = s.InnerText?.Trim();
                    if (string.IsNullOrWhiteSpace(json)) continue;

                    using var jd = JsonDocument.Parse(json);

                    if (jd.RootElement.ValueKind == JsonValueKind.Object)
                    {
                        var res = TryReadGeo(jd.RootElement);
                        if (!double.IsNaN(res.lat) && !double.IsNaN(res.lon)) return res;
                    }
                    else if (jd.RootElement.ValueKind == JsonValueKind.Array)
                    {
                        foreach (var el in jd.RootElement.EnumerateArray())
                        {
                            if (el.ValueKind != JsonValueKind.Object) continue;
                            var res = TryReadGeo(el);
                            if (!double.IsNaN(res.lat) && !double.IsNaN(res.lon)) return res;
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Failed to parse JSON-LD for coordinates");
            }

            return (double.NaN, double.NaN);

            static (double lat, double lon) TryReadGeo(JsonElement obj)
            {
                if (obj.TryGetProperty("geo", out var geo) && geo.ValueKind == JsonValueKind.Object)
                {
                    if (geo.TryGetProperty("latitude", out var latEl) &&
                        geo.TryGetProperty("longitude", out var lonEl))
                    {
                        var latStr = latEl.ToString();
                        var lonStr = lonEl.ToString();

                        if (double.TryParse(latStr, NumberStyles.Float, CultureInfo.InvariantCulture, out var lat) &&
                            double.TryParse(lonStr, NumberStyles.Float, CultureInfo.InvariantCulture, out var lon))
                        {
                            return (lat, lon);
                        }
                    }
                }

                return (double.NaN, double.NaN);
            }
        }

        private decimal? ExtractRating(HtmlDocument doc, string html)
        {
            // 1) Next data score (best effort)
            var mScore = Regex.Match(html, "\"score\"\\s*:\\s*(?<score>\\d+(?:\\.\\d+)?)", RegexOptions.IgnoreCase);
            if (mScore.Success &&
                decimal.TryParse(mScore.Groups["score"].Value, NumberStyles.Float, CultureInfo.InvariantCulture, out var score))
            {
                return score;
            }

            // 2) Fallback: "98 Positive" + "Negative 8" ratio -> 0..5
            var mp = Regex.Match(html, "(?<pos>\\d+)\\s*Positive", RegexOptions.IgnoreCase);
            var mn = Regex.Match(html, "Negative\\s*(?<neg>\\d+)", RegexOptions.IgnoreCase);
            if (mp.Success && mn.Success &&
                int.TryParse(mp.Groups["pos"].Value, out var pos) &&
                int.TryParse(mn.Groups["neg"].Value, out var neg) &&
                (pos + neg) > 0)
            {
                var ratio = pos / (decimal)(pos + neg);
                var fiveStar = ratio * 5m;
                return Math.Round(fiveStar, 2);
            }

            return null;
        }

        private string? ExtractPrice(HtmlDocument doc, string html)
        {
            // Prefer Next data fees
            var mf = Regex.Match(html, "\"fees\"\\s*:\\s*(?<fees>\\d+(?:\\.\\d+)?)", RegexOptions.IgnoreCase);
            if (mf.Success)
            {
                var feesStr = mf.Groups["fees"].Value;
                var perPerson = Regex.IsMatch(html, "\"is_price_for_single_person\"\\s*:\\s*true", RegexOptions.IgnoreCase);
                var price = perPerson ? $"From ${feesStr} (per person)" : $"From ${feesStr}";
                return Truncate(price, 200);
            }

            // Fallback: visible text "from $18 (per person)"
            var mt = Regex.Match(html, @"from\s*\$(?<amt>\d+(?:\.\d+)?)\s*(?<rest>\([^)]+\))?", RegexOptions.IgnoreCase);
            if (mt.Success)
            {
                var amt = mt.Groups["amt"].Value;
                var rest = mt.Groups["rest"].Success ? " " + mt.Groups["rest"].Value : "";
                return Truncate($"From ${amt}{rest}".Trim(), 200);
            }

            return null;
        }

        // ----------------------------
        // Descriptions (About section)
        // ----------------------------

        private Dictionary<string, string> ExtractDescriptionsFromAbout(HtmlDocument doc)
        {
            var descriptions = new Dictionary<string, string>();

            try
            {
                // Your target: class="Poi_aboutSection__hZ2a0" (hash changes; match prefix)
                var about = doc.DocumentNode.SelectSingleNode("//div[contains(@class,'Poi_aboutSection__')]");
                if (about == null)
                    return descriptions;

                var pNodes = about.SelectNodes(".//p");
                if (pNodes == null || pNodes.Count == 0)
                    return descriptions;

                var text = string.Join("\n\n", pNodes
                    .Select(p => HtmlEntity.DeEntitize(p.InnerText).Trim())
                    .Where(t => !string.IsNullOrWhiteSpace(t)));

                if (!string.IsNullOrWhiteSpace(text))
                    descriptions["en"] = text;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Error extracting About description");
            }

            return descriptions;
        }

        private string? TryExtractJsonLdDescription(HtmlDocument doc)
        {
            try
            {
                var scripts = doc.DocumentNode.SelectNodes("//script[@type='application/ld+json']");
                if (scripts == null) return null;

                foreach (var s in scripts)
                {
                    var json = s.InnerText?.Trim();
                    if (string.IsNullOrWhiteSpace(json)) continue;

                    using var jd = JsonDocument.Parse(json);

                    if (jd.RootElement.ValueKind == JsonValueKind.Object &&
                        jd.RootElement.TryGetProperty("description", out var d) &&
                        d.ValueKind == JsonValueKind.String)
                    {
                        var text = d.GetString()?.Trim();
                        if (!string.IsNullOrWhiteSpace(text)) return text;
                    }

                    if (jd.RootElement.ValueKind == JsonValueKind.Array)
                    {
                        foreach (var el in jd.RootElement.EnumerateArray())
                        {
                            if (el.ValueKind != JsonValueKind.Object) continue;
                            if (el.TryGetProperty("description", out var d2) && d2.ValueKind == JsonValueKind.String)
                            {
                                var text = d2.GetString()?.Trim();
                                if (!string.IsNullOrWhiteSpace(text)) return text;
                            }
                        }
                    }
                }
            }
            catch
            {
                // ignore
            }

            return null;
        }

        // ----------------------------
        // Amenities (Services/Types)
        // ----------------------------

        private (List<CampsiteType> types, List<CampsiteService> services) ExtractAmenities(HtmlDocument doc, string html)
        {
            // 1) Preferred: Next data "features":[{name,type},...]
            var (types, services) = ExtractAmenitiesFromFeatures(html);
            if (types.Count > 0 || services.Count > 0)
                return (types, services);

            // 2) Fallback: JSON-LD amenityFeature (names only -> services list)
            var ldAmenities = ExtractAmenityFeatureFromJsonLd(doc);
            if (ldAmenities.Count > 0)
            {
                services.AddRange(ldAmenities.Select(n => new CampsiteService { Name = n }));
                services = services
                    .GroupBy(x => x.Name, StringComparer.OrdinalIgnoreCase)
                    .Select(g => g.First())
                    .ToList();
                return (types, services);
            }

            // 3) Fallback: scrape DOM around "Amenities" section
            var (tDom, sDom) = ExtractAmenitiesFromDom(doc);
            return (tDom, sDom);
        }

        private (List<CampsiteType> types, List<CampsiteService> services) ExtractAmenitiesFromFeatures(string html)
        {
            var types = new List<CampsiteType>();
            var services = new List<CampsiteService>();

            try
            {
                var idx = html.IndexOf("\"features\"", StringComparison.OrdinalIgnoreCase);
                if (idx < 0) return (types, services);

                var bracketIdx = html.IndexOf('[', idx);
                if (bracketIdx < 0) return (types, services);

                var arrJson = ExtractBalancedJson(html, bracketIdx, '[', ']');
                if (string.IsNullOrWhiteSpace(arrJson)) return (types, services);

                using var jd = JsonDocument.Parse(arrJson);
                if (jd.RootElement.ValueKind != JsonValueKind.Array) return (types, services);

                foreach (var el in jd.RootElement.EnumerateArray())
                {
                    if (el.ValueKind != JsonValueKind.Object) continue;

                    var name = el.TryGetProperty("name", out var n) ? n.GetString() : null;
                    var type = el.TryGetProperty("type", out var t) ? t.GetString() : null;

                    if (string.IsNullOrWhiteSpace(name) || string.IsNullOrWhiteSpace(type))
                        continue;

                    // Map:
                    // SITES -> TypesList
                    // FACILITY/SERVICE/POLICY/... -> ServicesList
                    if (type.Equals("SITES", StringComparison.OrdinalIgnoreCase))
                        types.Add(new CampsiteType { Name = name.Trim() });
                    else
                        services.Add(new CampsiteService { Name = name.Trim() });
                }

                types = types.GroupBy(x => x.Name, StringComparer.OrdinalIgnoreCase).Select(g => g.First()).ToList();
                services = services.GroupBy(x => x.Name, StringComparer.OrdinalIgnoreCase).Select(g => g.First()).ToList();
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Failed to parse features[] amenities");
            }

            return (types, services);
        }

        private List<string> ExtractAmenityFeatureFromJsonLd(HtmlDocument doc)
        {
            var names = new List<string>();

            try
            {
                var scripts = doc.DocumentNode.SelectNodes("//script[@type='application/ld+json']");
                if (scripts == null) return names;

                foreach (var s in scripts)
                {
                    var json = s.InnerText?.Trim();
                    if (string.IsNullOrWhiteSpace(json)) continue;

                    using var jd = JsonDocument.Parse(json);

                    void readAmenities(JsonElement obj)
                    {
                        if (!obj.TryGetProperty("amenityFeature", out var af)) return;
                        if (af.ValueKind != JsonValueKind.Array) return;

                        foreach (var el in af.EnumerateArray())
                        {
                            if (el.ValueKind != JsonValueKind.Object) continue;
                            var n = el.TryGetProperty("name", out var nameEl) ? nameEl.GetString() : null;
                            if (!string.IsNullOrWhiteSpace(n)) names.Add(n.Trim());
                        }
                    }

                    if (jd.RootElement.ValueKind == JsonValueKind.Object)
                        readAmenities(jd.RootElement);
                    else if (jd.RootElement.ValueKind == JsonValueKind.Array)
                        foreach (var el in jd.RootElement.EnumerateArray())
                            if (el.ValueKind == JsonValueKind.Object)
                                readAmenities(el);
                }

                names = names.Distinct(StringComparer.OrdinalIgnoreCase).ToList();
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Failed to parse JSON-LD amenityFeature");
            }

            return names;
        }

        private (List<CampsiteType> types, List<CampsiteService> services) ExtractAmenitiesFromDom(HtmlDocument doc)
        {
            var types = new List<CampsiteType>();
            var services = new List<CampsiteService>();

            try
            {
                // Look for an element with id="amenities"
                var root = doc.DocumentNode.SelectSingleNode("//*[@id='amenities']");
                if (root == null)
                {
                    // fallback: find the heading text
                    var heading = doc.DocumentNode.SelectSingleNode("//*[self::h1 or self::h2 or self::h3][normalize-space()='Amenities']");
                    root = heading?.ParentNode;
                }

                if (root == null)
                    return (types, services);

                // Expect something like:
                // "Sites & Accommodation" -> items -> Types
                // "Facilities/Services/Policies" -> items -> Services
                var sectionNodes = root.SelectNodes(".//*[self::h3 or self::h4 or self::h5 or self::h6]");
                if (sectionNodes == null) return (types, services);

                foreach (var h in sectionNodes)
                {
                    var cat = HtmlEntity.DeEntitize(h.InnerText).Trim();
                    if (string.IsNullOrWhiteSpace(cat)) continue;

                    // Collect following sibling text nodes until next heading (best-effort)
                    // We search within the same parent container first.
                    var container = h.ParentNode;
                    var itemTexts = container?
                        .SelectNodes(".//*[self::li or self::p]")
                        ?.Select(n => HtmlEntity.DeEntitize(n.InnerText).Trim())
                        .Where(t => !string.IsNullOrWhiteSpace(t))
                        .Distinct(StringComparer.OrdinalIgnoreCase)
                        .ToList() ?? new List<string>();

                    if (itemTexts.Count == 0) continue;

                    var isTypesCategory = cat.Contains("Sites", StringComparison.OrdinalIgnoreCase) ||
                                          cat.Contains("Accommodation", StringComparison.OrdinalIgnoreCase);

                    foreach (var item in itemTexts)
                    {
                        if (isTypesCategory)
                            types.Add(new CampsiteType { Name = item });
                        else
                            services.Add(new CampsiteService { Name = item });
                    }
                }

                types = types.GroupBy(x => x.Name, StringComparer.OrdinalIgnoreCase).Select(g => g.First()).ToList();
                services = services.GroupBy(x => x.Name, StringComparer.OrdinalIgnoreCase).Select(g => g.First()).ToList();
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Failed to parse amenities from DOM");
            }

            return (types, services);
        }

        // ----------------------------
        // Images
        // ----------------------------

        private List<string> ExtractImageUrls(HtmlDocument doc, string html)
        {
            var urls = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            // 1) JSON-LD "image": string or array
            TryAddImagesFromJsonLd(doc, urls);

            // 2) <img srcset="..."> pick largest, prefer images.campermate.com/photos
            TryAddImagesFromSrcset(doc, urls);

            // 3) og:image
            var og = doc.DocumentNode.SelectSingleNode("//meta[@property='og:image']");
            if (og != null)
            {
                var content = og.GetAttributeValue("content", "").Trim();
                if (!string.IsNullOrWhiteSpace(content))
                    urls.Add(content);
            }

            // 4) Any anchors directly linking to photo CDNs (defensive)
            var aNodes = doc.DocumentNode.SelectNodes("//a[@href]");
            if (aNodes != null)
            {
                foreach (var a in aNodes)
                {
                    var href = a.GetAttributeValue("href", "").Trim();
                    if (IsLikelyPhotoUrl(href))
                        urls.Add(href);
                }
            }

            // Filter & return
            var filtered = urls
                .Where(IsLikelyPhotoUrl)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            _logger.LogInformation("Extracted {Count} image URLs", filtered.Count);
            return filtered;
        }

        private void TryAddImagesFromJsonLd(HtmlDocument doc, HashSet<string> urls)
        {
            try
            {
                var scripts = doc.DocumentNode.SelectNodes("//script[@type='application/ld+json']");
                if (scripts == null) return;

                foreach (var s in scripts)
                {
                    var json = s.InnerText?.Trim();
                    if (string.IsNullOrWhiteSpace(json)) continue;

                    using var jd = JsonDocument.Parse(json);

                    void readImages(JsonElement obj)
                    {
                        if (!obj.TryGetProperty("image", out var img)) return;

                        if (img.ValueKind == JsonValueKind.String)
                        {
                            var u = img.GetString();
                            if (!string.IsNullOrWhiteSpace(u)) urls.Add(u.Trim());
                        }
                        else if (img.ValueKind == JsonValueKind.Array)
                        {
                            foreach (var el in img.EnumerateArray())
                            {
                                if (el.ValueKind != JsonValueKind.String) continue;
                                var u = el.GetString();
                                if (!string.IsNullOrWhiteSpace(u)) urls.Add(u.Trim());
                            }
                        }
                    }

                    if (jd.RootElement.ValueKind == JsonValueKind.Object)
                        readImages(jd.RootElement);
                    else if (jd.RootElement.ValueKind == JsonValueKind.Array)
                        foreach (var el in jd.RootElement.EnumerateArray())
                            if (el.ValueKind == JsonValueKind.Object)
                                readImages(el);
                }
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Failed to parse JSON-LD images");
            }
        }

        private void TryAddImagesFromSrcset(HtmlDocument doc, HashSet<string> urls)
        {
            try
            {
                var imgs = doc.DocumentNode.SelectNodes("//img[@srcset]");
                if (imgs == null) return;

                foreach (var img in imgs)
                {
                    var srcset = HtmlEntity.DeEntitize(img.GetAttributeValue("srcset", ""));
                    if (string.IsNullOrWhiteSpace(srcset)) continue;

                    // Only consider srcsets that likely contain real photo CDN
                    if (!srcset.Contains("images.campermate.com/photos/", StringComparison.OrdinalIgnoreCase) &&
                        !srcset.Contains("photos.geozone.co.nz/photos/", StringComparison.OrdinalIgnoreCase))
                    {
                        continue;
                    }

                    var best = PickLargestFromSrcset(srcset);
                    if (!string.IsNullOrWhiteSpace(best))
                        urls.Add(best);
                }
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Failed to parse srcset images");
            }
        }

        private static bool IsLikelyPhotoUrl(string url)
        {
            if (string.IsNullOrWhiteSpace(url)) return false;

            // main photo CDNs seen on CamperMate pages
            var ok =
                url.Contains("images.campermate.com/photos/", StringComparison.OrdinalIgnoreCase) ||
                url.Contains("photos.geozone.co.nz/photos/", StringComparison.OrdinalIgnoreCase) ||
                url.Contains("submission.campermate.com/", StringComparison.OrdinalIgnoreCase);

            if (!ok) return false;

            // avoid obvious logo/assets
            if (url.Contains("webdata.campermate.com/assets/", StringComparison.OrdinalIgnoreCase)) return false;
            if (url.Contains("/assets/", StringComparison.OrdinalIgnoreCase)) return false;

            return true;
        }

        private async Task<List<string>> DownloadImagesAsync(List<string> imageUrls, string camperMateUuid)
        {
            var savedPaths = new List<string>();

            for (int i = 0; i < imageUrls.Count; i++)
            {
                try
                {
                    var imageUrl = imageUrls[i];

                    var extension = Path.GetExtension(new Uri(imageUrl).AbsolutePath);
                    if (string.IsNullOrEmpty(extension) || extension.Length > 8)
                        extension = ".jpg";

                    // Prefix with cm_ to avoid collisions with Park4Night IDs
                    var fileName = $"cm_{camperMateUuid}_{i + 1}{extension}";
                    var filePath = Path.Combine(_imagesBasePath, fileName);

                    var bytes = await _httpClient.GetByteArrayAsync(imageUrl);
                    await File.WriteAllBytesAsync(filePath, bytes);

                    // Store relative path for database - uses /images/campermate/ path
                    savedPaths.Add($"/images/campermate/{fileName}");
                    _logger.LogInformation("Downloaded image {Index}/{Total} for CamperMate {Uuid}", i + 1, imageUrls.Count, camperMateUuid);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Error downloading image {Index} from {Url}", i, imageUrls[i]);
                }
            }

            return savedPaths;
        }

        // ----------------------------
        // Helpers
        // ----------------------------

        private static string? GetQueryParam(string url, string key)
        {
            if (string.IsNullOrWhiteSpace(url) || string.IsNullOrWhiteSpace(key))
                return null;

            var qIdx = url.IndexOf('?', StringComparison.OrdinalIgnoreCase);
            if (qIdx < 0) return null;

            var query = url.Substring(qIdx + 1);
            foreach (var part in query.Split('&', StringSplitOptions.RemoveEmptyEntries))
            {
                var kv = part.Split('=', 2);
                if (kv.Length != 2) continue;

                if (kv[0].Equals(key, StringComparison.OrdinalIgnoreCase))
                    return kv[1];
            }

            return null;
        }

        private static string? PickLargestFromSrcset(string srcset)
        {
            // srcset format: "<url> 256w, <url> 384w, ... 3840w"
            int bestW = -1;
            string? bestUrl = null;

            foreach (var part in srcset.Split(',', StringSplitOptions.RemoveEmptyEntries))
            {
                var p = part.Trim();
                if (p.Length == 0) continue;

                var tokens = Regex.Split(p, "\\s+").Where(t => t.Length > 0).ToArray();
                if (tokens.Length == 0) continue;

                var url = tokens[0].Trim();
                var w = -1;

                if (tokens.Length > 1)
                {
                    var dm = Regex.Match(tokens[1], "^(\\d+)(w|x)$", RegexOptions.IgnoreCase);
                    if (dm.Success) int.TryParse(dm.Groups[1].Value, out w);
                }

                if (w > bestW)
                {
                    bestW = w;
                    bestUrl = url;
                }
                else if (bestUrl == null)
                {
                    bestUrl = url;
                }
            }

            return bestUrl;
        }

        private static string? ExtractBalancedJson(string text, int start, char open, char close)
        {
            // Extracts JSON array/object by tracking depth while respecting strings.
            int depth = 0;
            bool inString = false;
            bool escape = false;

            for (int i = start; i < text.Length; i++)
            {
                var c = text[i];

                if (escape)
                {
                    escape = false;
                    continue;
                }

                if (c == '\\')
                {
                    if (inString) escape = true;
                    continue;
                }

                if (c == '"')
                {
                    inString = !inString;
                    continue;
                }

                if (inString) continue;

                if (c == open) depth++;
                else if (c == close) depth--;

                if (depth == 0)
                    return text.Substring(start, i - start + 1);
            }

            return null;
        }

        private static string Truncate(string value, int maxLen)
        {
            if (string.IsNullOrEmpty(value)) return value;
            if (value.Length <= maxLen) return value;
            return value.Substring(0, maxLen);
        }
    }
}
