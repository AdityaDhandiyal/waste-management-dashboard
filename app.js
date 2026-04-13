class WasteManagementSystem {
    constructor() {
        this.config = window.appConfig;
        this.map = null;
        this.heatmapLayer = null;
        this.markerLayerGroup = L.layerGroup(); 
        this.markers = {}; 
        this.binsData = [];
        
        try {
            this.init();
        } catch (error) {
            console.error("System Initialization Failure:", error);
        }
    }

    init() {
        this.initMap();
        this.applyCityMask();
        this.loadData(); 
        this.updateSystem();
        this.initZoomListener();
    }

    initMap() {
        this.map = L.map('map', { 
            zoomControl: false,
            maxBounds: this.config.maxBounds,
            maxBoundsViscosity: 1.0,
            renderer: L.canvas() 
        }).setView(this.config.mapCenter, this.config.defaultZoom);
        
        L.control.zoom({ position: 'bottomright' }).addTo(this.map);
        
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            maxZoom: this.config.maxZoom, 
            minZoom: this.config.minZoom,
            bounds: this.config.maxBounds, 
            noWrap: true 
        }).addTo(this.map);
        
        this.markerLayerGroup.addTo(this.map); 
    }

    switchModule(moduleName, clickedElement) {
        if (clickedElement && clickedElement.classList.contains('active')) {
            clickedElement.classList.remove('active');
            document.querySelectorAll('.ui-panel').forEach(panel => panel.classList.remove('active-panel'));
            return; 
        }

        document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
        if (clickedElement) clickedElement.classList.add('active');

        document.querySelectorAll('.ui-panel').forEach(panel => panel.classList.remove('active-panel'));
        document.getElementById(`module-${moduleName}`).classList.add('active-panel');

        if(this.map) {
            setTimeout(() => { this.map.invalidateSize(); }, 300);
        }

        if (moduleName === 'analytics') window.analyticsSystem.renderChart();
    }

    initZoomListener() {
        this.map.on('zoomend', () => {
            if (this.map.getZoom() >= this.config.zoomThreshold) {
                this.map.addLayer(this.markerLayerGroup);
                if (this.heatmapLayer) this.map.removeLayer(this.heatmapLayer);
            } else {
                this.map.removeLayer(this.markerLayerGroup);
                if (this.heatmapLayer) this.map.addLayer(this.heatmapLayer);
            }
        });
    }

    applyCityMask() {
        L.polygon([this.config.worldMask, this.config.dehradunBorder], {
            color: '#000', weight: 0, stroke: false, fillColor: '#000', fillOpacity: 1.0 
        }).addTo(this.map);

        L.polygon(this.config.dehradunBorder, {
            color: '#00ffcc', weight: 2, fill: false, dashArray: '5, 10',
            lineCap: 'round', lineJoin: 'round' 
        }).addTo(this.map);
    }

    loadData() {
        this.binsData = window.binDatabase || []; 
        this.binsData.sort((a, b) => {
            if (a.zone === b.zone) return a.name.localeCompare(b.name);
            return a.zone.localeCompare(b.zone);
        });
    }

    getColor(capacity) {
        if (capacity < 50) return "#00ffcc"; 
        if (capacity < 85) return "#ffcc00"; 
        return "#ff4d4d"; 
    }

    updateSystem() {
        let dashboardHTML = ''; 
        let adminHTML = ''; 
        let heatData = [];
        let currentZone = "";
        
        this.markerLayerGroup.clearLayers(); 
        this.markers = {}; 

        this.binsData.forEach(bin => {
            let color = this.getColor(bin.capacity);
            heatData.push([bin.lat, bin.lng, (bin.capacity / 100)]);

            if (bin.zone !== currentZone) {
                dashboardHTML += `<div class="zone-header">${bin.zone}</div>`;
                currentZone = bin.zone;
            }

            dashboardHTML += `
                <div class="dash-item" style="border-left-color: ${color}" onclick="window.appSystem.focusBin(${bin.id})">
                    <div class="dash-title">${bin.name}</div>
                    <div class="dash-stat">Load: ${bin.capacity}%</div>
                    <div class="dash-bar-bg">
                        <div class="dash-bar-fill" style="width: ${bin.capacity}%; background-color: ${color};"></div>
                    </div>
                </div>
            `;

            adminHTML += `
                <div class="admin-row" style="border-left-color: ${color}">
                    <div>
                        <div class="admin-bin-name">${bin.name} (${bin.zone})</div>
                        <div class="admin-bin-cap">Current Load: ${bin.capacity}%</div>
                    </div>
                    <button onclick="window.appSystem.emptyBin(${bin.id})">Force Empty</button>
                </div>
            `;

            this.renderMarker(bin, color);
        });

        if (window.disposalCenters) {
            window.disposalCenters.forEach(center => {
                const hqIcon = L.divIcon({
                    html: `<div class="hq-marker"><div class="hq-core"></div><div class="hq-pulse"></div></div>`,
                    className: '', iconSize: [30, 30], iconAnchor: [15, 15]
                });
                
                L.marker([center.lat, center.lng], { icon: hqIcon })
                 .bindPopup(`<div class="popup-title">${center.name}</div><p style="font-size:0.8rem;color:#9ca3af;">Status: Operational</p>`)
                 .addTo(this.markerLayerGroup);
            });
        }

        document.getElementById('bin-list').innerHTML = dashboardHTML;
        document.getElementById('admin-bin-list').innerHTML = adminHTML; // NEW

        if (this.heatmapLayer) this.map.removeLayer(this.heatmapLayer);
        this.heatmapLayer = L.heatLayer(heatData, {
            radius: 40, blur: 25, maxZoom: 15, 
            gradient: {0.4: 'blue', 0.6: 'cyan', 0.7: 'lime', 0.8: 'yellow', 1.0: 'red'}
        });

        if (this.map.getZoom() >= this.config.zoomThreshold) {
            this.map.addLayer(this.markerLayerGroup);
        } else {
            this.map.addLayer(this.heatmapLayer);
        }

        if (window.analyticsSystem && document.getElementById('module-analytics').classList.contains('active-panel')) {
            window.analyticsSystem.renderChart();
        }
    }

    renderMarker(bin, color) {
        let iconHtml = `
            <div class="bin-marker" style="border-color: ${color};">
                <div class="bin-fill" style="height: ${bin.capacity}%; background-color: ${color};"></div>
            </div>
        `;
        let customIcon = L.divIcon({ html: iconHtml, className: '', iconSize: [24, 32], iconAnchor: [12, 32] });

        let popupHtml = `
            <div class="popup-title">${bin.name}</div>
            <div class="slider-container">
                <label>Adjust Capacity: <span id="val-${bin.id}">${bin.capacity}%</span></label>
                <input type="range" class="capacity-slider" min="0" max="100" value="${bin.capacity}" 
                       oninput="document.getElementById('val-${bin.id}').innerText = this.value + '%'"
                       onchange="window.appSystem.handleSlider(${bin.id}, this.value)">
            </div>
            <button class="empty-btn" onclick="window.appSystem.emptyBin(${bin.id})">Empty Bin</button>
        `;

        let marker = L.marker([bin.lat, bin.lng], {icon: customIcon}).bindPopup(popupHtml);
        this.markers[bin.id] = marker;
        this.markerLayerGroup.addLayer(marker);
    }

    focusBin(id) {
        let bin = this.binsData.find(b => b.id === id);
        if (bin) {
            this.map.flyTo([bin.lat, bin.lng], 16, { duration: 0.6 });
            this.map.once('moveend', () => {
                if(this.markers[id]) this.markers[id].openPopup();
            });
        }
    }

    handleSlider(id, newValue) {
        let bin = this.binsData.find(b => b.id === id);
        if (bin) {
            bin.capacity = parseInt(newValue);
            this.updateSystem();
        }
    }

    emptyBin(id) {
        let bin = this.binsData.find(b => b.id === id);
        if (bin) {
            bin.capacity = 0; 
            this.updateSystem(); 
            this.map.closePopup(); 
        }
    }
}

window.onload = () => {
    window.appSystem = new WasteManagementSystem();
};