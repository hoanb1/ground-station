import React, { useRef, useEffect } from 'react';
import { Box, Typography, useTheme } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { Y_AXIS_WIDTH, X_AXIS_HEIGHT, Y_AXIS_TOP_MARGIN, elevationToYPercent } from './timeline-constants.jsx';

/**
 * PassCurve component - Renders a single satellite pass as an SVG path
 */
export const PassCurve = ({ pass, startTime, endTime }) => {
  const theme = useTheme();

  // Color based on peak altitude
  const getColor = () => {
    if (pass.isCurrent) {
      return theme.palette.success.main;
    }
    if (pass.peak_altitude > 40) return theme.palette.info.main;
    if (pass.peak_altitude > 20) return theme.palette.info.light;
    return theme.palette.grey[500];
  };

  const pathData = [];

  // Use actual elevation curve if available
  if (pass.elevation_curve && pass.elevation_curve.length > 0) {
    const totalDuration = endTime.getTime() - startTime.getTime();

    pass.elevation_curve.forEach((point) => {
      const pointTime = new Date(point.time).getTime();

      // Skip points outside the visible time window
      if (pointTime < startTime.getTime() || pointTime > endTime.getTime()) {
        return;
      }

      // Use UNIFIED COORDINATE SYSTEM
      // X: Time to percentage (0% = start, 100% = end)
      const x = ((pointTime - startTime.getTime()) / totalDuration) * 100;

      // Y: Elevation to percentage (0% = 90° top, 100% = 0° bottom)
      const y = elevationToYPercent(point.elevation);

      pathData.push(`${x},${y}`);
    });
  } else {
    // Fallback to parabolic curve if no elevation_curve data
    const points = 100;
    for (let i = 0; i <= points; i++) {
      const t = i / points;
      const x = pass.left + (pass.width * t);
      const elevationRatio = 4 * t * (1 - t);
      const elevationAtPoint = pass.peak_altitude * elevationRatio;
      // Use UNIFIED COORDINATE SYSTEM
      const y = elevationToYPercent(elevationAtPoint);
      pathData.push(`${x},${y}`);
    }
  }

  if (pathData.length === 0) {
    return null;
  }

  // Create SVG path from points
  const pathString = pathData.map((point, i) => {
    const [x, y] = point.split(',');
    return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
  }).join(' ');

  // Get first and last X coordinates for closing the path
  const firstX = pathData[0].split(',')[0];
  const lastX = pathData[pathData.length - 1].split(',')[0];

  // Close the path to baseline (bottom at Y=100 using UNIFIED COORDINATE SYSTEM)
  const bottomY = 100; // 0° elevation = 100% from top
  const fillPath = `${pathString} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;

  return (
    <svg
      style={{
        position: 'absolute',
            top: `${Y_AXIS_TOP_MARGIN}px`,
        left: `${Y_AXIS_WIDTH}px`,
        width: `calc(100% - ${Y_AXIS_WIDTH}px)`,
        height: `calc(100% - ${X_AXIS_HEIGHT + Y_AXIS_TOP_MARGIN}px)`, // Account for top margin and time axis
        pointerEvents: 'none',
      }}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
    >
      {/* Fill under curve */}
      <path
        d={fillPath}
        fill={getColor()}
        opacity={pass.isCurrent ? 0.3 : 0.2}
        style={{ pointerEvents: 'auto', cursor: 'pointer' }}
      />
      {/* Curve line */}
      <path
        d={pathString}
        stroke={getColor()}
        strokeWidth="0.5"
        fill="none"
        opacity={pass.isCurrent ? 1 : 0.8}
        vectorEffect="non-scaling-stroke"
        style={{ pointerEvents: 'auto', cursor: 'pointer' }}
      />
    </svg>
  );
};

/**
 * CurrentTimeMarker component - Renders the NOW marker showing current time
 * Uses CSS transforms and requestAnimationFrame for smooth movement without re-renders
 */
export const CurrentTimeMarker = ({ startTime, endTime }) => {
  const theme = useTheme();
  const { t } = useTranslation('target');

  const markerRef = useRef(null);
  const arrowRef = useRef(null);
  const horizontalLineRef = useRef(null);
  const labelRef = useRef(null);
  const animationFrameRef = useRef(null);

  useEffect(() => {
    const updateMarkerPosition = () => {
      if (!markerRef.current) return;

      const now = Date.now();
      const totalDuration = endTime.getTime() - startTime.getTime();
      const position = ((now - startTime.getTime()) / totalDuration) * 100;

      // Don't render if position is negative (past the left edge)
      if (position < 0) {
        markerRef.current.style.display = 'none';
        animationFrameRef.current = requestAnimationFrame(updateMarkerPosition);
        return;
      }

      markerRef.current.style.display = 'block';

      // Calculate the translateX value to move the marker
      // Base position is Y_AXIS_WIDTH, then add percentage of remaining width
      const translateX = `calc(${Y_AXIS_WIDTH}px + (100% - ${Y_AXIS_WIDTH}px) * ${position / 100})`;

      // Update all elements with transform for GPU acceleration
      if (markerRef.current) {
        markerRef.current.style.left = translateX;
      }
      if (arrowRef.current) {
        arrowRef.current.style.left = translateX;
      }
      if (horizontalLineRef.current) {
        horizontalLineRef.current.style.left = translateX;
      }
      if (labelRef.current) {
        labelRef.current.style.left = `calc(${translateX} + 30px)`;
      }

      // Determine if we should show label on right (position < 80%)
      const showLabelOnRight = position < 80;

      // Toggle visibility of arrow vs label elements
      if (arrowRef.current) {
        arrowRef.current.style.display = showLabelOnRight ? 'none' : 'block';
      }
      if (horizontalLineRef.current) {
        horizontalLineRef.current.style.display = showLabelOnRight ? 'block' : 'none';
      }
      if (labelRef.current) {
        labelRef.current.style.display = showLabelOnRight ? 'block' : 'none';
      }

      // Adjust vertical line top position based on label visibility
      if (markerRef.current) {
        markerRef.current.style.top = showLabelOnRight
          ? `${Y_AXIS_TOP_MARGIN - 8}px`
          : `${Y_AXIS_TOP_MARGIN}px`;
      }

      // Continue animation
      animationFrameRef.current = requestAnimationFrame(updateMarkerPosition);
    };

    // Start animation loop
    animationFrameRef.current = requestAnimationFrame(updateMarkerPosition);

    // Cleanup
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [startTime, endTime]);

  const labelVerticalPosition = -8; // pixels from top of chart area (raised for better visibility)

  return (
    <>
      {/* Vertical NOW line - from horizontal line to bottom */}
      <Box
        ref={markerRef}
        sx={{
          position: 'absolute',
          left: 0, // Will be set by JS
          top: `${Y_AXIS_TOP_MARGIN}px`, // Will be adjusted by JS
          bottom: `${X_AXIS_HEIGHT}px`,
          width: '1px',
          backgroundColor: theme.palette.error.main,
          zIndex: 20,
          boxShadow: `0 0 8px ${theme.palette.error.main}40`,
          willChange: 'left, top', // Hint for GPU acceleration
        }}
      />

      {/* Arrow at top - only show when no label */}
      <Box
        ref={arrowRef}
        sx={{
          position: 'absolute',
          left: 0, // Will be set by JS
          top: `${Y_AXIS_TOP_MARGIN}px`,
          transform: 'translateX(-50%)',
          width: '0',
          height: '0',
          borderLeft: '6px solid transparent',
          borderRight: '6px solid transparent',
          borderTop: `8px solid ${theme.palette.error.main}`,
          zIndex: 20,
          willChange: 'left', // Hint for GPU acceleration
        }}
      />

      {/* Horizontal line to label (on right side) */}
      <Box
        ref={horizontalLineRef}
        sx={{
          position: 'absolute',
          left: 0, // Will be set by JS
          top: `${Y_AXIS_TOP_MARGIN + labelVerticalPosition}px`,
          width: '30px',
          height: '1px',
          backgroundColor: theme.palette.error.main,
          zIndex: 20,
          willChange: 'left', // Hint for GPU acceleration
        }}
      />

      {/* NOW label */}
      <Box
        ref={labelRef}
        sx={{
          position: 'absolute',
          left: 0, // Will be set by JS
          top: `${Y_AXIS_TOP_MARGIN + labelVerticalPosition}px`,
          transform: 'translateY(-50%)',
          fontSize: '0.65rem',
          fontWeight: 'bold',
          color: theme.palette.error.main,
          backgroundColor: theme.palette.background.paper,
          padding: '2px 6px',
          borderRadius: '2px',
          border: `1px solid ${theme.palette.error.main}`,
          whiteSpace: 'nowrap',
          zIndex: 20,
          willChange: 'left', // Hint for GPU acceleration
        }}
      >
        {t('timeline.now')}
      </Box>
    </>
  );
};

/**
 * PassTooltipContent component - Renders tooltip content for a satellite pass
 */
export const PassTooltipContent = ({ pass, isCurrent, timezone = 'UTC' }) => {
  const { t } = useTranslation('target');

  const formatTime = (isoString) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: timezone
    });
  };

  const formatDuration = (durationStr) => {
    const match = durationStr.match(/0:(\d{2}):(\d{2})/);
    if (match) {
      return `${match[1]}m ${match[2]}s`;
    }
    return durationStr;
  };

  return (
    <Box sx={{ p: 1 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1 }}>
        {pass.name} {isCurrent ? `(${t('timeline.active')})` : ''}
      </Typography>
      <Typography variant="body2">
        {t('timeline.start')}: {formatTime(pass.event_start)}
      </Typography>
      <Typography variant="body2">
        {t('timeline.end')}: {formatTime(pass.event_end)}
      </Typography>
      <Typography variant="body2">
        {t('timeline.duration')}: {formatDuration(pass.duration)}
      </Typography>
      <Typography variant="body2" sx={{ mt: 1 }}>
        {t('timeline.maxElevation')}: {pass.peak_altitude.toFixed(1)}°
      </Typography>
      <Typography variant="body2">
        {t('timeline.minDistance')}: {pass.distance_at_peak.toFixed(0)} km
      </Typography>
    </Box>
  );
};
