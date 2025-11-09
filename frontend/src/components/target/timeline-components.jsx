import React from 'react';
import { Box, Typography, useTheme } from '@mui/material';
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
 */
export const CurrentTimeMarker = ({ position }) => {
  const theme = useTheme();

  // Calculate position accounting for Y-axis
  const leftPosition = `calc(${Y_AXIS_WIDTH}px + (100% - ${Y_AXIS_WIDTH}px) * ${position / 100})`;

  // Only show label on right if there's enough space (position < 80%)
  const showLabelOnRight = position < 80;
  const labelVerticalPosition = -8; // pixels from top of chart area (raised for better visibility)

  return (
    <>
      {/* Vertical NOW line - from horizontal line to bottom */}
      <Box
        sx={{
          position: 'absolute',
          left: leftPosition,
          top: showLabelOnRight ? `${Y_AXIS_TOP_MARGIN + labelVerticalPosition}px` : `${Y_AXIS_TOP_MARGIN}px`,
          bottom: `${X_AXIS_HEIGHT}px`,
          width: '1px',
          backgroundColor: theme.palette.error.main,
          zIndex: 20,
          boxShadow: `0 0 8px ${theme.palette.error.main}40`,
        }}
      />

      {/* Arrow at top - only show when no label */}
      {!showLabelOnRight && (
        <Box
          sx={{
            position: 'absolute',
            left: leftPosition,
            top: `${Y_AXIS_TOP_MARGIN}px`,
            transform: 'translateX(-50%)',
            width: '0',
            height: '0',
            borderLeft: '6px solid transparent',
            borderRight: '6px solid transparent',
            borderTop: `8px solid ${theme.palette.error.main}`,
            zIndex: 20,
          }}
        />
      )}

      {showLabelOnRight && (
        <>
          {/* Horizontal line to label (on right side) */}
          <Box
            sx={{
              position: 'absolute',
              left: leftPosition,
              top: `${Y_AXIS_TOP_MARGIN + labelVerticalPosition}px`,
              width: '30px',
              height: '1px',
              backgroundColor: theme.palette.error.main,
              zIndex: 20,
            }}
          />

          {/* NOW label */}
          <Box
            sx={{
              position: 'absolute',
              left: `calc(${leftPosition} + 30px)`,
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
            }}
          >
            NOW
          </Box>
        </>
      )}
    </>
  );
};

/**
 * PassTooltipContent component - Renders tooltip content for a satellite pass
 */
export const PassTooltipContent = ({ pass, isCurrent, timezone = 'UTC' }) => {
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
        {pass.name} {isCurrent ? '(ACTIVE)' : ''}
      </Typography>
      <Typography variant="body2">
        Start: {formatTime(pass.event_start)}
      </Typography>
      <Typography variant="body2">
        End: {formatTime(pass.event_end)}
      </Typography>
      <Typography variant="body2">
        Duration: {formatDuration(pass.duration)}
      </Typography>
      <Typography variant="body2" sx={{ mt: 1 }}>
        Max Elevation: {pass.peak_altitude.toFixed(1)}°
      </Typography>
      <Typography variant="body2">
        Min Distance: {pass.distance_at_peak.toFixed(0)} km
      </Typography>
    </Box>
  );
};
