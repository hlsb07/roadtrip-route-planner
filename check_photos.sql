-- Check if photos exist in database and have PhotoUrls
SELECT
    pp.id,
    pp."GooglePlaceId",
    gp."Name" as place_name,
    pp."PhotoReference",
    pp."PhotoUrl",
    pp."Width",
    pp."Height",
    pp."IsPrimary",
    pp."OrderIndex"
FROM "PlacePhotos" pp
LEFT JOIN "GooglePlaceData" gp ON pp."GooglePlaceId" = gp."GooglePlaceId"
ORDER BY pp."GooglePlaceId", pp."OrderIndex"
LIMIT 50;

-- Count photos by place
SELECT
    gp."GooglePlaceId",
    gp."Name",
    COUNT(pp.id) as photo_count,
    COUNT(CASE WHEN pp."PhotoUrl" IS NOT NULL AND pp."PhotoUrl" != '' THEN 1 END) as photos_with_url
FROM "GooglePlaceData" gp
LEFT JOIN "PlacePhotos" pp ON gp."GooglePlaceId" = pp."GooglePlaceId"
GROUP BY gp."GooglePlaceId", gp."Name"
HAVING COUNT(pp.id) > 0
ORDER BY photo_count DESC
LIMIT 20;
