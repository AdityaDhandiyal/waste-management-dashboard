class FleetSystem {
    constructor() {
        this.trucks = {};
        this.activeRoutes = L.layerGroup();
        this.isInitialized = false;
        this.isDeploying = false;
        
        this.speedMultiplier = 1.0; 
        this.savedSpeed = 1.0; 
        this.isPaused = false; 
    }

    togglePlayPause() {
        const btn = document.getElementById('play-pause-btn');
        if (this.isPaused) {
            this.isPaused = false;
            this.speedMultiplier = this.savedSpeed;
            btn.innerText = '⏸'; 
        } else {
            this.isPaused = true;
            this.savedSpeed = this.speedMultiplier;
            this.speedMultiplier = 0;
            btn.innerText = '▶';
        }
    }

    changeSpeed(amount) {
        if (this.isPaused) this.togglePlayPause(); 

        this.speedMultiplier += amount;
        if (this.speedMultiplier < 0.5) this.speedMultiplier = 0.5;
        
        if (this.speedMultiplier > 10.0) this.speedMultiplier = 10.0; 
        
        this.savedSpeed = this.speedMultiplier; 
        document.getElementById('speed-display').innerText = this.speedMultiplier.toFixed(1) + 'x';
    }

    init() {
        if (this.isInitialized) return;
        this.activeRoutes.addTo(window.appSystem.map);
        this.isInitialized = true;
    }

    getDistance(pos1, pos2) {
        return L.latLng(pos1.lat, pos1.lng).distanceTo(L.latLng(pos2.lat, pos2.lng));
    }

    runDispatch() {
        if (this.isDeploying) {
            alert("Fleet Command: Trucks are already deployed.");
            return;
        }

        this.init();
        const fullBins = window.appSystem.binsData.filter(b => b.capacity >= 80);
        
        if (fullBins.length === 0) {
            alert("Fleet Command: No critical loads detected. System standby.");
            return;
        }

        this.isDeploying = true;
        const hq1 = window.disposalCenters[0];
        const hq2 = window.disposalCenters[1];

        let hq1Tasks = [];
        let hq2Tasks = [];

        fullBins.forEach(bin => {
            const distToHQ1 = this.getDistance(bin, hq1);
            const distToHQ2 = this.getDistance(bin, hq2);
            if (distToHQ1 <= distToHQ2) hq1Tasks.push(bin);
            else hq2Tasks.push(bin);
        });

        const optimizeRoute = (startPos, tasks) => {
            let unvisited = [...tasks];
            let optimizedPath = [];
            let currentPos = startPos;
            while (unvisited.length > 0) {
                unvisited.sort((a, b) => this.getDistance(currentPos, a) - this.getDistance(currentPos, b));
                let nextTarget = unvisited.shift();
                optimizedPath.push(nextTarget);
                currentPos = nextTarget;
            }
            return optimizedPath;
        };

        const optimizedHQ1Tasks = optimizeRoute(hq1, hq1Tasks);
        const optimizedHQ2Tasks = optimizeRoute(hq2, hq2Tasks);

        if (optimizedHQ1Tasks.length > 0) this.createTruck(1, hq1, optimizedHQ1Tasks);
        if (optimizedHQ2Tasks.length > 0) this.createTruck(2, hq2, optimizedHQ2Tasks);
        
        document.getElementById('fleet-status').innerHTML = `
            <div class="status-box" style="border-left: 3px solid #00ffcc">
                <strong>Active Dispatch:</strong> ${fullBins.length} high-load nodes identified.<br>
                <strong>Optimization:</strong> Nearest Neighbor applied.
            </div>
        `;
    }

    createTruck(id, startPoint, taskList) {
        const truckIcon = L.divIcon({ html: `<div class="truck-marker">🚛</div>`, className: '', iconSize: [30, 30] });

        const popupHtml = `
            <div class="truck-ui-title">Unit ${id} Controls</div>
            <div class="toggle-row">
                <span>Show Active Path</span>
                <input type="checkbox" checked onchange="window.routeSystem.togglePath(${id}, this.checked)">
            </div>
        `;

        const marker = L.marker([startPoint.lat, startPoint.lng], { icon: truckIcon })
            .bindPopup(popupHtml)
            .addTo(window.appSystem.map);

        this.trucks[id] = {
            id: id,
            marker: marker,
            tasks: taskList,
            showSegment: true,
            currentLine: null
        };

        this.processNextTask(this.trucks[id], startPoint);
    }

    getRoadPath(start, end) {
        return new Promise((resolve) => {
            const router = L.Routing.osrmv1();
            router.route([
                L.Routing.waypoint(L.latLng(start.lat, start.lng)),
                L.Routing.waypoint(L.latLng(end.lat, end.lng))
            ], (err, routes) => {
                if (!err && routes && routes.length > 0) resolve(routes[0].coordinates); 
                else resolve([start, end]); 
            });
        });
    }

    async processNextTask(truck, currentPos) {
        if (truck.tasks.length === 0) {
            const hq = window.disposalCenters[truck.id - 1];
            const coords = await this.getRoadPath(currentPos, hq);
            await this.animateMove(truck, coords);
            document.getElementById('fleet-status').innerHTML += `<div class="status-box">Unit ${truck.id}: Mission Complete. Returned to Base.</div>`;
            
            truck.marker.remove();
            delete this.trucks[truck.id];
            if (Object.keys(this.trucks).length === 0) this.isDeploying = false;
            return;
        }

        const nextBin = truck.tasks.shift();
        const coords = await this.getRoadPath(currentPos, nextBin);
        
        truck.currentLine = L.polyline(coords, {
            renderer: L.svg(), 
            color: '#00ffcc', 
            weight: 3, 
            className: 'route-line'
        });
        
        if (truck.showSegment) truck.currentLine.addTo(this.activeRoutes);

        await this.animateMove(truck, coords);
        
        window.appSystem.emptyBin(nextBin.id);
        if (this.activeRoutes.hasLayer(truck.currentLine)) {
            this.activeRoutes.removeLayer(truck.currentLine);
        }
        
        setTimeout(() => this.processNextTask(truck, nextBin), 1500 / this.speedMultiplier);
    }

    async animateMove(truck, coords) {
        const speedKmH = 120; 
        const speedMS = speedKmH * (1000 / 3600); 

        for (let i = 0; i < coords.length - 1; i++) {
            const start = coords[i];
            const end = coords[i+1];
            const distance = L.latLng(start.lat, start.lng).distanceTo(L.latLng(end.lat, end.lng));
            if (distance === 0) continue;
            
            const baseDuration = (distance / speedMS) * 1000; 
            await this.animateSegment(truck, start, end, baseDuration);
        }
    }

    animateSegment(truck, start, end, baseDuration) {
        return new Promise(resolve => {
            let progress = 0;
            let lastTime = performance.now();
            
            const frame = (now) => {
                const delta = now - lastTime;
                lastTime = now;
                
                progress += (delta * this.speedMultiplier) / baseDuration;
                if (progress > 1) progress = 1;
                
                const currentLat = start.lat + (end.lat - start.lat) * progress;
                const currentLng = start.lng + (end.lng - start.lng) * progress;
                truck.marker.setLatLng([currentLat, currentLng]);

                if (progress < 1) requestAnimationFrame(frame);
                else resolve();
            };
            requestAnimationFrame(frame);
        });
    }

    togglePath(truckId, isVisible) {
        const truck = this.trucks[truckId];
        if (truck) {
            truck.showSegment = isVisible;
            if (truck.currentLine) {
                if (isVisible) truck.currentLine.addTo(this.activeRoutes);
                else this.activeRoutes.removeLayer(truck.currentLine);
            }
        }
    }
}

window.routeSystem = new FleetSystem();