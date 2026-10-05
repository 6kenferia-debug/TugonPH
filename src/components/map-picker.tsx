import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import { Button } from "./ui/button";
import { Alert, AlertDescription } from "./ui/alert";
import { MapPin, Navigation, AlertTriangle } from "lucide-react";

interface LatLng {
  lat: number;
  lng: number;
}

interface LocationResult {
  lat: number;
  lng: number;
  address: string;
}

interface MapPickerProps {
  initialCoordinates?: LatLng | null;
  onLocationSelect: (location: LocationResult) => void;
  onClose?: () => void;
}

// Approximate NU Manila campus-area selection boundary, not an official boundary.
const NU_MANILA_CENTER: LatLng = { lat: 14.6038, lng: 120.9947 };

// Keeps map panning focused on the campus and nearby streets.
const NU_MANILA_BOUNDS: [[number, number], [number, number]] = [
  [14.6005, 120.991], // SW corner
  [14.607, 120.998], // NE corner
];

// Approximate selectable area around NU Manila and nearby campus streets.
const NU_MANILA_POLYGON_COORDS: [number, number][] = [
  [14.6062, 120.9931], // NW
  [14.6061, 120.9964], // N
  [14.6053, 120.9972], // NE
  [14.6022, 120.997], // E-SE
  [14.6013, 120.9958], // SE
  [14.6014, 120.9927], // SW
  [14.6023, 120.9919], // W
  [14.6053, 120.9921], // NW-W
  [14.6062, 120.9931], // close
];

// Point-in-polygon check (ray casting algorithm)
function isInsidePolygon(point: LatLng, polygon: [number, number][]): boolean {
  const { lat, lng } = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];
    const intersect =
      yi > lng !== yj > lng &&
      lat < ((xj - xi) * (lng - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function MapPicker({ initialCoordinates, onLocationSelect, onClose }: MapPickerProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const resizeTimersRef = useRef<number[]>([]);
  const [selectedCoords, setSelectedCoords] = useState<LatLng | null>(
    initialCoordinates || null,
  );
  const [outsideWarning, setOutsideWarning] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [address, setAddress] = useState<string>("");
  const [mapReady, setMapReady] = useState(false);

  const queueMapResize = () => {
    const map = mapRef.current;
    if (!map) return;

    requestAnimationFrame(() => {
      map.invalidateSize();
    });

    resizeTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    resizeTimersRef.current = [120, 300, 600].map((delay) =>
      window.setTimeout(() => {
        map.invalidateSize();
      }, delay),
    );
  };

  // Reverse geocode using Nominatim (no API key required)
  const reverseGeocode = async (lat: number, lng: number): Promise<string> => {
    try {
      setGeocoding(true);
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
        { headers: { "Accept-Language": "en" } },
      );
      if (!res.ok) return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      const data = await res.json();
      // Build a short address string from the response
      const a = data.address || {};
      const parts = [
        a.road || a.pedestrian || a.path || "",
        a.suburb || a.neighbourhood || a.quarter || "",
        a.city || a.town || a.village || "Manila",
      ].filter(Boolean);
      return parts.join(", ") || data.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    } catch {
      return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    } finally {
      setGeocoding(false);
    }
  };

  const placeMarker = async (L: any, lat: number, lng: number, isInitial = false) => {
    const inside = isInsidePolygon({ lat, lng }, NU_MANILA_POLYGON_COORDS);

    if (!inside && !isInitial) {
      setOutsideWarning(true);
      setTimeout(() => setOutsideWarning(false), 4000);
      return;
    }

    // Use the NU Manila center if initial coordinates are outside the selection area.
    const finalLat = (!inside && isInitial) ? NU_MANILA_CENTER.lat : lat;
    const finalLng = (!inside && isInitial) ? NU_MANILA_CENTER.lng : lng;

    setOutsideWarning(false);

    // Remove existing marker
    if (markerRef.current) {
      markerRef.current.remove();
    }

    // Custom red pin icon
    const icon = L.divIcon({
      html: `<div style="width:28px;height:36px;position:relative;">
        <svg viewBox="0 0 28 36" xmlns="http://www.w3.org/2000/svg">
          <path d="M14 0C6.268 0 0 6.268 0 14c0 9.333 14 22 14 22S28 23.333 28 14C28 6.268 21.732 0 14 0z" fill="#ef4444"/>
          <circle cx="14" cy="14" r="6" fill="white"/>
        </svg>
      </div>`,
      className: "",
      iconSize: [28, 36],
      iconAnchor: [14, 36],
      popupAnchor: [0, -36],
    });

    const marker = L.marker([finalLat, finalLng], {
      icon,
      draggable: true,
    }).addTo(mapRef.current);
    let lastValidPosition: LatLng = { lat: finalLat, lng: finalLng };

    marker.on("dragend", async (e: any) => {
      const pos = e.target.getLatLng();
      const insideDrag = isInsidePolygon(
        { lat: pos.lat, lng: pos.lng },
        NU_MANILA_POLYGON_COORDS,
      );
      if (!insideDrag) {
        marker.setLatLng([lastValidPosition.lat, lastValidPosition.lng]);
        setOutsideWarning(true);
        setTimeout(() => setOutsideWarning(false), 4000);
      } else {
        lastValidPosition = { lat: pos.lat, lng: pos.lng };
        const addr = await reverseGeocode(pos.lat, pos.lng);
        setSelectedCoords({ lat: pos.lat, lng: pos.lng });
        setAddress(addr);
      }
    });

    markerRef.current = marker;
    const addr = await reverseGeocode(finalLat, finalLng);
    setSelectedCoords({ lat: finalLat, lng: finalLng });
    setAddress(addr);
  };

  useEffect(() => {
    if (!mapContainerRef.current) return;
    let disposed = false;

    // Dynamically import leaflet (avoids any SSR issues)
    import("leaflet").then((L) => {
      if (disposed || !mapContainerRef.current) return;
      // Avoid double-init in strict mode
      if (mapRef.current) return;

      // Fix default icon paths broken by Vite
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: markerIcon2x,
        iconUrl: markerIcon,
        shadowUrl: markerShadow,
      });

      const map = L.map(mapContainerRef.current!, {
        center: [NU_MANILA_CENTER.lat, NU_MANILA_CENTER.lng],
        zoom: 16,
        minZoom: 15,
        maxZoom: 19,
        maxBounds: NU_MANILA_BOUNDS,
        maxBoundsViscosity: 1.0,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      mapRef.current = map;

      // Draw the approximate NU Manila selection area.
      const polygonLatLngs = NU_MANILA_POLYGON_COORDS.map(([lat, lng]) => [lat, lng] as [number, number]);
      L.polygon(polygonLatLngs, {
        color: "#3b82f6",
        weight: 2.5,
        opacity: 0.8,
        fillColor: "#3b82f6",
        fillOpacity: 0.07,
        dashArray: "6 4",
      }).addTo(map).bindTooltip("National University Manila", {
        permanent: false,
        direction: "center",
        className: "text-xs font-medium",
      });

      // Place initial marker if coordinates provided
      if (initialCoordinates) {
        placeMarker(L, initialCoordinates.lat, initialCoordinates.lng, true);
      }

      // Click handler
      map.on("click", (e: any) => {
        placeMarker(L, e.latlng.lat, e.latlng.lng);
      });

      setMapReady(true);
      queueMapResize();
    });

    return () => {
      disposed = true;
      resizeTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
      resizeTimersRef.current = [];
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
      }
    };
  }, []);

  const handleConfirm = () => {
    if (!selectedCoords) return;
    onLocationSelect({
      lat: selectedCoords.lat,
      lng: selectedCoords.lng,
      address,
    });
  };

  const handleMyLocation = () => {
    if (!navigator.geolocation || !mapRef.current) return;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        import("leaflet").then((L) => {
          const inside = isInsidePolygon({ lat, lng }, NU_MANILA_POLYGON_COORDS);
          if (inside) {
            mapRef.current.setView([lat, lng], 18);
            placeMarker(L, lat, lng);
          } else {
            setOutsideWarning(true);
            setTimeout(() => setOutsideWarning(false), 4000);
          }
        });
      },
      () => {
        setOutsideWarning(true);
        setTimeout(() => setOutsideWarning(false), 3000);
      },
    );
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Map */}
      <div
        className="relative rounded-lg overflow-hidden border"
        style={{
          height: "min(56dvh, 380px)",
          minHeight: 320,
          width: "100%",
        }}
      >
        <div
          ref={mapContainerRef}
          className="w-full h-full"
          style={{ height: "100%", minHeight: "100%" }}
        />

        {!mapReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted/80">
            <div className="text-center space-y-2">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-sm text-muted-foreground">Loading map…</p>
            </div>
          </div>
        )}

        {/* My Location button */}
        <button
          type="button"
          onClick={handleMyLocation}
          className="absolute top-3 right-3 z-[1000] bg-white  shadow-md rounded-md p-2 hover:bg-gray-50  transition-colors border border-border"
          title="Use my current location"
        >
          <Navigation className="w-4 h-4 text-primary" />
        </button>

        {/* Instruction banner */}
        <div className="absolute bottom-3 left-3 right-12 z-[1000] pointer-events-none">
          <div className="bg-background/90 backdrop-blur-sm rounded-md px-3 py-2 text-xs text-muted-foreground text-center border border-border shadow-sm">
            {selectedCoords
              ? geocoding
                ? "Getting address…"
                : `📍 ${address || `${selectedCoords.lat.toFixed(5)}, ${selectedCoords.lng.toFixed(5)}`}`
              : "Click inside the blue boundary to pin your location"}
          </div>
        </div>
      </div>

      {/* Outside boundary warning */}
      {outsideWarning && (
        <Alert className="border-amber-300 bg-amber-50   py-2">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-700  text-sm">
            That location is <strong>outside the NU Manila area</strong>. Please pin a location within the blue boundary.
          </AlertDescription>
        </Alert>
      )}

      {/* Coordinates readout */}
      {selectedCoords && (
        <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 rounded-md text-xs text-muted-foreground">
          <MapPin className="w-3 h-3 shrink-0 text-primary" />
          <span>
            Lat: <strong>{selectedCoords.lat.toFixed(6)}</strong> &nbsp; Lng:{" "}
            <strong>{selectedCoords.lng.toFixed(6)}</strong>
          </span>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-2">
        {onClose && (
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
        )}
        <Button
          type="button"
          onClick={handleConfirm}
          disabled={!selectedCoords || geocoding}
          className="flex items-center gap-2"
        >
          <MapPin className="w-4 h-4" />
          {geocoding ? "Getting address…" : "Confirm Location"}
        </Button>
      </div>
    </div>
  );
}
