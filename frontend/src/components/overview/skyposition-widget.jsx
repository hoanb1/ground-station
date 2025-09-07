import React, { useEffect, useRef, useState } from "react";

const SkyPositionFormatter = React.memo(({ params }) => {
    const [, setForceUpdate] = useState(0);
    const canvasRef = useRef(null);

    // Force component to update regularly
    useEffect(() => {
        const interval = setInterval(() => {
            setForceUpdate(prev => prev + 1);
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    // Draw the satellite trajectory on canvas
    useEffect(() => {
        if (!canvasRef.current || !params.row) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;

        // Clear canvas
        ctx.clearRect(0, 0, width, height);

        const now = new Date();
        const startDate = new Date(params.row.event_start);
        const endDate = new Date(params.row.event_end);
        const peakElevation = params.row.peak_altitude;

        if (params.row.is_geostationary || params.row.is_geosynchronous) {
            // Draw infinity symbol for geostationary satellites
            ctx.font = '14px Arial';
            ctx.fillStyle = '#1976d2';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('∞', width / 2, height / 2);
            return;
        }

        // If the pass hasn't started or has ended
        if (startDate > now || endDate < now) {
            return;
        }

        // Calculate current position
        const totalDuration = endDate - startDate;
        const elapsedDuration = now - startDate;
        const progressRatio = Math.min(1, Math.max(0, elapsedDuration / totalDuration));

        // Draw horizon line
        ctx.beginPath();
        ctx.moveTo(0, height - 1);
        ctx.lineTo(width, height - 1);
        ctx.strokeStyle = '#888';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Draw trajectory arc
        ctx.beginPath();

        // Generate points for a smoother curve
        const points = [];
        for (let i = 0; i <= width; i += 5) {
            const x = i / width;
            const peakTime = 0.5; // Mid-point of the pass
            const timeToMidpoint = Math.abs(x - peakTime);
            const percentToMidpoint = 1 - (timeToMidpoint / peakTime);
            const y = height - (percentToMidpoint * peakElevation / 90 * height);
            points.push({ x: i, y });
        }

        // Draw curve through points
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);

        for (let i = 1; i < points.length; i++) {
            ctx.lineTo(points[i].x, points[i].y);
        }

        // Style for the trajectory path
        ctx.strokeStyle = 'rgba(25, 118, 210, 0.5)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Fill area beneath curve
        ctx.lineTo(points[points.length - 1].x, height);
        ctx.lineTo(points[0].x, height);
        ctx.closePath();
        ctx.fillStyle = 'rgba(25, 118, 210, 0.1)';
        ctx.fill();

        // Calculate current satellite position
        const currentX = progressRatio * width;
        const peakTime = 0.5;
        const timeToMidpoint = Math.abs(progressRatio - peakTime);
        const percentToMidpoint = 1 - (timeToMidpoint / peakTime);
        const currentY = height - (percentToMidpoint * peakElevation / 90 * height);

        // Draw current position marker
        ctx.beginPath();
        ctx.arc(currentX, currentY, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#ff9800';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 152, 0, 0.6)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Draw peak elevation marker
        const peakX = width / 2;
        const peakY = height - (peakElevation / 90 * height);

        ctx.beginPath();
        ctx.arc(peakX, peakY, 2, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(25, 118, 210, 0.6)';
        ctx.fill();

        // Add direction indicator
        const approachingPeak = progressRatio < 0.5;
        ctx.font = '10px Arial';
        ctx.fillStyle = '#1976d2';
        ctx.textAlign = 'center';
        ctx.fillText(approachingPeak ? '↑' : '↓', currentX, currentY + (approachingPeak ? 10 : -10));

    }, [params.row, canvasRef.current]);

    if (!params.row) return null;

    return (
        <div style={{ width: '100%', height: '40px', position: 'relative' }}>
            <canvas
                ref={canvasRef}
                width={80}
                height={40}
                style={{
                    width: '100%',
                    height: '100%',
                    display: 'block'
                }}
                title={`${params.row.peak_altitude?.toFixed(1)}° max elevation`}
            />
        </div>
    );
});

export default SkyPositionFormatter;