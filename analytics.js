class AnalyticsSystem {
    constructor() {
        this.chartInstance = null;
    }

    renderChart() {
        const ctx = document.getElementById('zoneChart').getContext('2d');
        
        let zoneData = {};
        window.appSystem.binsData.forEach(bin => {
            if (!zoneData[bin.zone]) zoneData[bin.zone] = { total: 0, count: 0 };
            zoneData[bin.zone].total += bin.capacity;
            zoneData[bin.zone].count += 1;
        });

        const labels = Object.keys(zoneData);
        const dataPoints = labels.map(zone => (zoneData[zone].total / zoneData[zone].count).toFixed(1));

        if (this.chartInstance) {
            this.chartInstance.destroy();
        }

        this.chartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Avg Zone Load (%)',
                    data: dataPoints,
                    backgroundColor: 'rgba(0, 255, 204, 0.5)',
                    borderColor: '#00ffcc',
                    borderWidth: 1,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                color: '#9ca3af',
                scales: {
                    y: { 
                        beginAtZero: true, max: 100,
                        grid: { color: 'rgba(255,255,255,0.1)' },
                        ticks: { color: '#9ca3af' }
                    },
                    x: { 
                        grid: { display: false },
                        ticks: { color: '#9ca3af' }
                    }
                },
                plugins: {
                    legend: { labels: { color: '#fff' } }
                }
            }
        });
    }
}

window.analyticsSystem = new AnalyticsSystem();