
    const S = (sel, el=document) => el.querySelector(sel);
    const E = (tag, props={}) => Object.assign(document.createElement(tag), props);

    const statusEl = S('#status');
    const sugEl = S('#suggestions');
    const qEl = S('#q');

    const WMO = {
      0: 'Clear sky',
      1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
      45: 'Fog', 48: 'Depositing rime fog',
      51: 'Light drizzle', 53: 'Moderate drizzle', 55: 'Dense drizzle',
      56: 'Light freezing drizzle', 57: 'Dense freezing drizzle',
      61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain',
      66: 'Light freezing rain', 67: 'Heavy freezing rain',
      71: 'Slight snow', 73: 'Moderate snow', 75: 'Heavy snow',
      77: 'Snow grains', 80: 'Slight rain showers', 81: 'Moderate rain showers', 82: 'Violent rain showers',
      85: 'Slight snow showers', 86: 'Heavy snow showers',
      95: 'Thunderstorm', 96: 'Thunderstorm with slight hail', 99: 'Thunderstorm with heavy hail'
    };

    const fmtTemp = v => `${Math.round(v)}°C`;
    const fmtWind = v => `${Math.round(v)} km/h`;
    const fmtPerc = v => `${Math.round(v)}%`;
    const fmtMm = v => `${(v ?? 0).toFixed(1)} mm`;

    async function geocode(query) {
      const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
      url.search = new URLSearchParams({ name: query, count: 8, language: 'en', format: 'json' });
      const res = await fetch(url);
      if (!res.ok) throw new Error('Geocoding failed');
      const data = await res.json();
      return data.results || [];
    }

    async function fetchWeather({ latitude, longitude, timezone }) {
      const url = new URL('https://api.open-meteo.com/v1/forecast');
      url.search = new URLSearchParams({
        latitude, longitude,
        current: ['temperature_2m','relative_humidity_2m','apparent_temperature','weather_code','wind_speed_10m','precipitation'].join(','),
        hourly: ['temperature_2m','precipitation_probability','weather_code'].join(','),
        daily: ['temperature_2m_max','temperature_2m_min','precipitation_sum','weather_code'].join(','),
        timezone: timezone || 'auto'
      });
      const res = await fetch(url);
      if (!res.ok) throw new Error('Weather fetch failed');
      return res.json();
    }

    function showStatus(msg, type='') {
      statusEl.innerHTML = type === 'loading' ? `<span class="spinner"></span> ${msg}` : msg;
      statusEl.className = type === 'error' ? 'err' : 'muted';
    }

    function hideSuggestionsSoon() {
      setTimeout(() => sugEl.classList.remove('show'), 120);
    }

    function renderSuggestions(list) {
      sugEl.innerHTML = '';
      list.forEach(place => {
        const btn = E('button');
        const parts = [place.name, place.admin1, place.country].filter(Boolean);
        btn.textContent = parts.join(', ');
        btn.addEventListener('click', () => {
          qEl.value = parts.join(', ');
          selectPlace(place);
          hideSuggestionsSoon();
        });
        sugEl.appendChild(btn);
      });
      sugEl.classList.toggle('show', list.length > 0);
    }

    async function selectPlace(place) {
      const title = [place.name, place.admin1, place.country].filter(Boolean).join(', ');
      S('#place').textContent = title;
      S('#latlon').textContent = `${place.latitude.toFixed(3)}, ${place.longitude.toFixed(3)}`;
      showStatus('Fetching latest weather…', 'loading');
      try {
        const wx = await fetchWeather(place);
        fillCurrent(wx);
        fillForecast(wx);
        S('#tz').textContent = wx.timezone;
        showStatus(`Updated: ${new Date(wx.current.time).toLocaleString()}`);
      } catch (e) {
        showStatus('Failed to fetch weather. Try another location.', 'error');
        console.error(e);
      }
    }

    function fillCurrent(wx) {
  const c = wx.current;
  S('#currentWrap').style.display = 'block';
  S('#temp').textContent = fmtTemp(c.temperature_2m);
  S('#desc').textContent = WMO[c.weather_code] || '—';
  S('#feels').textContent = fmtTemp(c.apparent_temperature);
  S('#hum').textContent = fmtPerc(c.relative_humidity_2m);
  S('#wind').textContent = fmtWind(c.wind_speed_10m);
  S('#precip').textContent = fmtMm(c.precipitation);

  document.body.classList.remove('sunny','cloudy','foggy','drizzle','rainy','snowy','stormy');
  const code = c.weather_code;
  if ([0,1].includes(code)) document.body.classList.add('sunny');
  else if ([2,3].includes(code)) document.body.classList.add('cloudy');
  else if ([45,48].includes(code)) document.body.classList.add('foggy');
  else if ([51,53,55].includes(code)) document.body.classList.add('drizzle');
  else if ([61,63,65,80,81,82].includes(code)) document.body.classList.add('rainy');
  else if ([71,73,75,85,86].includes(code)) document.body.classList.add('snowy');
  else if ([95,96,99].includes(code)) document.body.classList.add('stormy');
  else document.body.classList.add('cloudy');
}
function fillForecast(wx) {
      const f = wx.daily;
      const days = f.time.map((t, i) => ({
        date: new Date(t), code: f.weather_code[i], hi: f.temperature_2m_max[i], lo: f.temperature_2m_min[i], p: f.precipitation_sum[i]
      }));
      const wrap = S('#forecast');
      wrap.innerHTML = '';
      days.forEach(d => {
        const el = E('div', { className: 'day' });
        const dow = d.date.toLocaleDateString(undefined, { weekday: 'short' });
        const md = d.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        el.innerHTML = `
          <div class="muted">${dow}</div>
          <div style="font-weight:700">${md}</div>
          <div style="margin:6px 0">${WMO[d.code] || ''}</div>
          <div><span class="hi">${Math.round(d.hi)}°</span> / ${Math.round(d.lo)}°</div>
          <div class="muted">💧 ${fmtMm(d.p)}</div>
        `;
        wrap.appendChild(el);
      });
    }

    // Events
    let lastQuery = '';
    let debounceTimer;
    qEl.addEventListener('input', () => {
      const q = qEl.value.trim();
      clearTimeout(debounceTimer);
      if (!q) { sugEl.classList.remove('show'); return; }
      debounceTimer = setTimeout(async () => {
        if (q === lastQuery) return; lastQuery = q;
        showStatus('Searching places…', 'loading');
        try {
          const results = await geocode(q);
          renderSuggestions(results);
          showStatus(results.length ? 'Pick a place from the list.' : 'No matches. Try a different query.');
        } catch (e) {
          showStatus('Search failed. Check your connection.', 'error');
        }
      }, 250);
    });

    document.addEventListener('click', (e) => {
      if (!sugEl.contains(e.target) && e.target !== qEl) sugEl.classList.remove('show');
    });

    S('#useLocation').addEventListener('click', () => {
      if (!navigator.geolocation) { showStatus('Geolocation is not supported on this device.', 'error'); return; }
      showStatus('Getting your location…', 'loading');
      navigator.geolocation.getCurrentPosition(async pos => {
        const { latitude, longitude } = pos.coords;
        try {
          // Reverse geocode to get a name
          const url = new URL('https://geocoding-api.open-meteo.com/v1/reverse');
          url.search = new URLSearchParams({ latitude, longitude, language: 'en' });
          const res = await fetch(url);
          const data = await res.json();
          const place = data && data.results && data.results[0] ? data.results[0] : { name: 'Current location', country: '', admin1: '', latitude, longitude };
          selectPlace(place);
        } catch (e) {
          selectPlace({ name: 'Current location', latitude, longitude });
        }
      }, err => {
        showStatus('Location access denied. Search by name instead.', 'error');
      }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 });
    });

    // Sensible default: try to load weather for user IP region via free IP info (no external call). Instead, prefill with "Kolkata" for demonstration.
    (async () => {
      qEl.value = 'Kolkata';
      try { const results = await geocode('Kolkata'); if (results[0]) selectPlace(results[0]); } catch {}
    })();
