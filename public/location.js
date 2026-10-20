document.querySelectorAll('[data-location-search]').forEach((container) => {
  const input = container.querySelector('input[name="location"]');
  const link = container.querySelector('[data-map-link]');

  function updateMapLink() {
    const location = input.value.trim();
    link.hidden = !location;
    if (location) {
      link.href = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(location);
    } else {
      link.removeAttribute('href');
    }
  }

  input.addEventListener('input', updateMapLink);
  updateMapLink();

  const mapElement = container.querySelector('[data-location-map]');
  const status = container.querySelector('[data-map-status]');
  if (!mapElement) return;
  if (!window.L) {
    status.textContent = 'Map could not load. Check your internet connection or enter an address manually.';
    mapElement.hidden = true;
    return;
  }

  const map = L.map(mapElement).setView([1.3521, 103.8198], 12);
  const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);
  tiles.on('tileerror', () => {
    status.textContent = 'Map tiles could not load. Check your connection or enter an address manually.';
  });
  let marker;
  const searchButton = container.querySelector('[data-find-address]');
  const results = container.querySelector('[data-address-results]');
  const cache = new Map();
  let lastSearch = 0;
  let revision = 0;
  input.addEventListener('input', () => {
    revision++;
    results.replaceChildren();
  });

  async function findAddress() {
    const query = input.value.trim();
    if (!query) {
      status.textContent = 'Enter an address or restaurant name and city first.';
      input.focus();
      return;
    }
    if (Date.now() - lastSearch < 1100) {
      status.textContent = 'Please wait a moment before searching again.';
      return;
    }
    const searchRevision = ++revision;
    lastSearch = Date.now();
    searchButton.disabled = true;
    results.replaceChildren();
    status.textContent = 'Searching for addresses…';
    try {
      let places = cache.get(query);
      if (!places) {
        const response = await fetch('https://photon.komoot.io/api/?limit=5&lat=1.3521&lon=103.8198&q=' + encodeURIComponent(query), {
          signal: AbortSignal.timeout(12000)
        });
        if (!response.ok) throw new Error('Search failed');
        const data = await response.json();
        if (!Array.isArray(data.features)) throw new Error('Invalid results');
        places = data.features.map((feature) => {
          const p = feature.properties || {};
          const coordinates = feature.geometry?.coordinates || [];
          return {
            display_name: [...new Set([p.name, [p.housenumber, p.street].filter(Boolean).join(' '), p.district, p.city, p.state, p.postcode, p.country].filter(Boolean))].join(', '),
            lat: coordinates[1], lon: coordinates[0]
          };
        });
        places = places.filter((place) => typeof place.display_name === 'string' && Number.isFinite(Number(place.lat)) && Number.isFinite(Number(place.lon)) && Math.abs(Number(place.lat)) <= 90 && Math.abs(Number(place.lon)) <= 180);
        cache.set(query, places);
      }
      if (searchRevision !== revision) return;
      status.textContent = places.length ? 'Select the matching address below.' : 'No address found. Try the full street address, postal code and city.';
      places.forEach((place) => {
        const option = document.createElement('button');
        option.type = 'button';
        option.className = 'list-group-item list-group-item-action';
        option.textContent = place.display_name;
        option.addEventListener('click', () => {
          input.value = place.display_name;
          updateMapLink();
          const point = [Number(place.lat), Number(place.lon)];
          showMarker(point);
          map.setView(point, 17);
          results.replaceChildren();
          status.textContent = 'Located: ' + place.display_name;
        });
        results.appendChild(option);
      });
    } catch (error) {
      if (searchRevision === revision) status.textContent = 'Address search is unavailable. Please try again, or enter the address manually.';
    } finally {
      searchButton.disabled = false;
    }
  }
  searchButton.addEventListener('click', findAddress);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (!searchButton.disabled) findAddress();
    }
  });

  function selectPoint(point) {
    revision++;
    results.replaceChildren();
    const lat = Math.max(-90, Math.min(90, point.lat));
    const lng = ((point.lng + 180) % 360 + 360) % 360 - 180;
    input.value = lat.toFixed(6) + ', ' + lng.toFixed(6);
    updateMapLink();
    showMarker([lat, lng]);
    status.textContent = 'Selected: ' + input.value + '. Drag the pin or click another point to adjust.';
  }

  function showMarker(point) {
    if (marker) {
      marker.setLatLng(point);
    } else {
      marker = L.marker(point, { draggable: true }).addTo(map);
      marker.on('dragend', () => selectPoint(marker.getLatLng()));
    }
  }

  function restorePoint() {
    const match = input.value.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
    if (match && Math.abs(Number(match[1])) <= 90 && Math.abs(Number(match[2])) <= 180) {
      const point = [Number(match[1]), Number(match[2])];
      showMarker(point);
      map.setView(point, 16);
      status.textContent = 'Selected: ' + input.value + '. Drag the pin to adjust.';
    } else if (marker) {
      marker.remove();
      marker = null;
      status.textContent = 'Click the map to select a location, or keep your typed address.';
    }
  }

  map.on('click', (event) => selectPoint(event.latlng));
  input.addEventListener('input', restorePoint);
  restorePoint();
});
