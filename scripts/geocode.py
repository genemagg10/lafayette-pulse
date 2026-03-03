"""
Geocode location strings to lat/lng coordinates for Lafayette, CA projects.
Uses geopy with Nominatim (free, no API key required) with rate limiting.
Falls back to a hardcoded lookup table for common Lafayette streets.
"""

import time
from geopy.geocoders import Nominatim
from geopy.exc import GeocoderTimedOut, GeocoderServiceError

# Rate limiter: Nominatim requires max 1 request per second
_last_request_time = 0.0

# Hardcoded lookup for common Lafayette, CA streets and locations
LAFAYETTE_LOCATIONS = {
    "mt. diablo blvd": (37.8935, -122.1178),
    "mt diablo blvd": (37.8935, -122.1178),
    "mount diablo blvd": (37.8935, -122.1178),
    "mount diablo boulevard": (37.8935, -122.1178),
    "moraga rd": (37.8870, -122.1240),
    "moraga road": (37.8870, -122.1240),
    "olympic blvd": (37.8960, -122.1120),
    "olympic boulevard": (37.8960, -122.1120),
    "happy valley rd": (37.8850, -122.1050),
    "happy valley road": (37.8850, -122.1050),
    "deer hill rd": (37.9000, -122.1130),
    "deer hill road": (37.9000, -122.1130),
    "pleasant hill rd": (37.9010, -122.1060),
    "pleasant hill road": (37.9010, -122.1060),
    "1st st": (37.8930, -122.1195),
    "first street": (37.8930, -122.1195),
    "lafayette-moraga trail": (37.8750, -122.1250),
    "lafayette moraga trail": (37.8750, -122.1250),
    "briones regional park": (37.9200, -122.1400),
    "lafayette reservoir": (37.8830, -122.1400),
    "lafayette elementary": (37.8930, -122.1160),
    "burton valley elementary": (37.8820, -122.1270),
    "springhill elementary": (37.8990, -122.1050),
    "stanley middle school": (37.8870, -122.1180),
    "acalanes high school": (37.8970, -122.1110),
    "lafayette city hall": (37.8935, -122.1185),
    "lafayette community center": (37.8925, -122.1175),
    "downtown lafayette": (37.8935, -122.1178),
    "lafayette bart station": (37.8933, -122.1247),
    "st. marys rd": (37.8860, -122.1090),
    "st marys rd": (37.8860, -122.1090),
    "reliez station rd": (37.9050, -122.1080),
    "reliez station road": (37.9050, -122.1080),
    "silverado dr": (37.8900, -122.1050),
    "silverado drive": (37.8900, -122.1050),
    "brown ave": (37.8920, -122.1200),
    "brook st": (37.8945, -122.1175),
    "lafayette circle": (37.8940, -122.1180),
}

# Default center of Lafayette if all else fails
LAFAYETTE_CENTER = (37.8935, -122.1178)


def geocode(location: str) -> tuple[float, float] | None:
    """
    Geocode a location string to (latitude, longitude).

    Tries Nominatim first, falls back to hardcoded lookup table.
    Returns None if the location cannot be geocoded.
    """
    if not location:
        return None

    # First, try the hardcoded lookup
    location_lower = location.lower().strip()
    for key, coords in LAFAYETTE_LOCATIONS.items():
        if key in location_lower:
            return coords

    # Try Nominatim with rate limiting
    global _last_request_time
    elapsed = time.time() - _last_request_time
    if elapsed < 1.0:
        time.sleep(1.0 - elapsed)

    try:
        geolocator = Nominatim(user_agent="vibrant-lafayette-tracker")
        # Append Lafayette, CA for better results
        query = location
        if "lafayette" not in location_lower:
            query = f"{location}, Lafayette, CA"

        result = geolocator.geocode(query, timeout=10)
        _last_request_time = time.time()

        if result:
            return (result.latitude, result.longitude)
    except (GeocoderTimedOut, GeocoderServiceError) as e:
        print(f"Geocoding error for '{location}': {e}")
        _last_request_time = time.time()

    return None


if __name__ == "__main__":
    # Test with some example locations
    test_locations = [
        "Mt. Diablo Blvd between 1st St and Moraga Rd",
        "Lafayette-Moraga Trail",
        "Happy Valley Road near Springhill Elementary",
        "Downtown Lafayette",
    ]

    for loc in test_locations:
        coords = geocode(loc)
        if coords:
            print(f"  '{loc}' -> ({coords[0]:.4f}, {coords[1]:.4f})")
        else:
            print(f"  '{loc}' -> NOT FOUND")
