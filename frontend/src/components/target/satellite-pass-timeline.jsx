import React, { useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { Box, Paper, Typography, Tooltip, useTheme, IconButton } from '@mui/material';
import { styled } from '@mui/material/styles';
import { TitleBar, getClassNamesBasedOnGridEditing } from '../common/common.jsx';
import { useTranslation } from 'react-i18next';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import SunCalc from 'suncalc';

// Constants
const Y_AXIS_WIDTH = 25; // Width of elevation axis in pixels
const X_AXIS_HEIGHT = 30; // Height of time axis in pixels
const Y_AXIS_TOP_MARGIN = 20; // Top margin to prevent 90° label clipping
const ZOOM_FACTOR = 1.3; // Zoom step multiplier (higher = bigger steps)

/**
 * UNIFIED COORDINATE SYSTEM:
 *
 * The chart area (excluding axes) uses this coordinate system:
 * - X-axis (Time): 0% = left edge (start time), 100% = right edge (end time)
 * - Y-axis (Elevation): 0% = top (90°), 100% = bottom (0°)
 *
 * Conversion formulas:
 * - Time to X%: ((time - startTime) / totalDuration) * 100
 * - Elevation to Y%: ((90 - elevation) / 90) * 100
 *
 * Chart boundaries in DOM:
 * - Left: Y_AXIS_WIDTH px
 * - Right: 100% of container
 * - Top: Y_AXIS_TOP_MARGIN px
 * - Bottom: Container height - X_AXIS_HEIGHT px
 */

// Helper function: Convert elevation degrees to Y percentage (0% = top/90°, 100% = bottom/0°)
const elevationToYPercent = (elevation) => ((90 - elevation) / 90) * 100;

const TimelineContainer = styled(Box)(({ theme }) => ({
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  backgroundColor: theme.palette.background.paper,
  overflow: 'hidden',
}));

const TimelineContent = styled(Box)(({ theme }) => ({
  flex: 1,
  overflow: 'auto',
  display: 'flex',
  flexDirection: 'column',
}));

const TimelineCanvas = styled(Box)(({ theme }) => ({
  position: 'relative',
  flex: 1,
  backgroundColor: theme.palette.mode === 'dark' ? '#1a1a1a' : '#f5f5f5',
  borderRadius: theme.shape.borderRadius,
  overflow: 'hidden',
  padding: '0 4px',
}));

const TimelineAxis = styled(Box)(({ theme }) => ({
  position: 'absolute',
  bottom: 0,
  left: 0,
  right: 0,
  height: `${X_AXIS_HEIGHT}px`,
  display: 'flex',
  alignItems: 'center',
  borderTop: `1px solid ${theme.palette.divider}`,
  backgroundColor: theme.palette.background.default,
  overflow: 'hidden',
}));

const ElevationAxis = styled(Box)(({ theme }) => ({
  position: 'absolute',
  left: 0,
  top: `${Y_AXIS_TOP_MARGIN}px`,
  bottom: `${X_AXIS_HEIGHT}px`,
  width: `${Y_AXIS_WIDTH}px`,
  borderRight: `1px solid ${theme.palette.divider}`,
  borderBottom: 'none',
  backgroundColor: theme.palette.background.default,
}));

const ElevationLabel = styled(Typography)(({ theme }) => ({
  position: 'absolute',
  fontSize: '0.65rem',
  color: theme.palette.text.secondary,
  userSelect: 'none',
  textAlign: 'right',
  paddingRight: '4px',
  width: '100%',
  transform: 'translateY(-50%)', // Center the label on its position
  zIndex: 2, // Ensure labels appear above corner boxes
}));

const TimeLabel = styled(Typography)(({ theme }) => ({
  position: 'absolute',
  fontSize: '0.7rem',
  color: theme.palette.text.secondary,
  userSelect: 'none',
  transform: 'translateX(-50%)',
  whiteSpace: 'nowrap',
}));

const PassCurve = ({ pass, startTime, endTime }) => {
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

const CurrentTimeMarker = ({ position }) => {
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

const PassTooltipContent = ({ pass, isCurrent, timezone = 'UTC' }) => {
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

export const SatellitePassTimeline = ({
  timeWindowHours: initialTimeWindowHours = 8,
  pastOffsetHours = 2, // Hours to offset into the past on initial render
  showSunShading = true,
  showSunMarkers = true
}) => {
  const theme = useTheme();
  const { t } = useTranslation('target');

  // Zoom state: time window configuration
  const [timeWindowHours, setTimeWindowHours] = useState(initialTimeWindowHours);
  // Initialize with past offset: start time = now - pastOffsetHours
  const [timeWindowStart, setTimeWindowStart] = useState(() => {
    const now = new Date();
    return now.getTime() - (pastOffsetHours * 60 * 60 * 1000);
  });

  // Mouse hover state
  const [hoverPosition, setHoverPosition] = useState(null);
  const [hoverTime, setHoverTime] = useState(null);

  // Pan state
  const [isPanning, setIsPanning] = useState(false);
  const [panStartX, setPanStartX] = useState(null);
  const [panStartTime, setPanStartTime] = useState(null);

  // Touch state
  const [lastTouchDistance, setLastTouchDistance] = useState(null);
  const [touchStartTime, setTouchStartTime] = useState(null);

  // Get satellite passes from Redux store
  const satellitePasses = useSelector((state) => state.targetSatTrack.satellitePasses);
  const activePass = useSelector((state) => state.targetSatTrack.activePass);
  const gridEditable = useSelector((state) => state.targetSatTrack.gridEditable);
  const satelliteData = useSelector((state) => state.targetSatTrack.satelliteData);
  const groundStationLocation = useSelector((state) => state.location.location);

  // Get timezone from preferences
  const timezone = useSelector((state) => {
    const timezonePref = state.preferences.preferences.find((pref) => pref.name === 'timezone');
    return timezonePref ? timezonePref.value : 'UTC';
  });

  const { timelineData, currentTimePosition, timeLabels, startTime, endTime, sunData } = useMemo(() => {
    const now = new Date();
    const startTime = timeWindowStart ? new Date(timeWindowStart) : new Date(now);
    const endTime = new Date(startTime.getTime() + timeWindowHours * 60 * 60 * 1000);

    // Calculate sun times for the timeline window
    let sunData = { nightPeriods: [], sunEvents: [] };
    if (groundStationLocation && (showSunShading || showSunMarkers)) {
      const { lat, lon } = groundStationLocation;

      const nightPeriods = [];
      const sunEvents = [];

      // Calculate for each day in the timeline window
      // Start from 1 day before to catch night periods that started before the window
      const startDate = new Date(startTime);
      startDate.setDate(startDate.getDate() - 1);
      startDate.setHours(0, 0, 0, 0);

      const endDate = new Date(endTime);
      endDate.setDate(endDate.getDate() + 1);
      endDate.setHours(23, 59, 59, 999);

      let currentDate = new Date(startDate);
      while (currentDate <= endDate) {
        // SunCalc returns times in local timezone
        const sunTimes = SunCalc.getTimes(currentDate, lat, lon);
        const sunrise = sunTimes.sunrise;
        const sunset = sunTimes.sunset;

        // Check if sunrise is valid and within window
        if (sunrise && !isNaN(sunrise.getTime()) && sunrise >= startTime && sunrise <= endTime) {
          sunEvents.push({ time: sunrise.getTime(), type: 'sunrise' });
        }

        // Check if sunset is valid and within window
        if (sunset && !isNaN(sunset.getTime()) && sunset >= startTime && sunset <= endTime) {
          sunEvents.push({ time: sunset.getTime(), type: 'sunset' });
        }

        // Move to next day
        currentDate.setDate(currentDate.getDate() + 1);
      }

      // Sort events by time
      sunEvents.sort((a, b) => a.time - b.time);

      // Build night periods from events
      // Start by checking if we're in night at the start of the timeline
      const firstDayTimes = SunCalc.getTimes(new Date(startTime), lat, lon);
      const isNightAtStart = startTime < firstDayTimes.sunrise || startTime > firstDayTimes.sunset;

      if (isNightAtStart) {
        // Find first sunrise
        const firstSunrise = sunEvents.find(e => e.type === 'sunrise');
        if (firstSunrise) {
          nightPeriods.push({
            start: startTime.getTime(),
            end: firstSunrise.time
          });
        } else {
          // Entire window is night
          nightPeriods.push({
            start: startTime.getTime(),
            end: endTime.getTime()
          });
        }
      }

      // Create night periods between sunset and sunrise events
      for (let i = 0; i < sunEvents.length; i++) {
        if (sunEvents[i].type === 'sunset') {
          // Find next sunrise
          const nextSunrise = sunEvents.slice(i + 1).find(e => e.type === 'sunrise');
          if (nextSunrise) {
            nightPeriods.push({
              start: sunEvents[i].time,
              end: nextSunrise.time
            });
          } else {
            // No more sunrises, night until end of timeline
            nightPeriods.push({
              start: sunEvents[i].time,
              end: endTime.getTime()
            });
          }
        }
      }

      sunData = { nightPeriods, sunEvents };
    }

    if (!satellitePasses || satellitePasses.length === 0) {
      return { timelineData: [], currentTimePosition: 0, timeLabels: [], startTime, endTime, sunData };
    }

    // Calculate current time position (0-100%)
    const totalDuration = endTime.getTime() - startTime.getTime();
    const currentPosition = ((now.getTime() - startTime.getTime()) / totalDuration) * 100;

    // Generate time labels with dynamic interval based on zoom level
    let labelInterval;
    if (timeWindowHours <= 0.5) {
      labelInterval = 0.05; // 3 minutes
    } else if (timeWindowHours <= 1) {
      labelInterval = 0.1; // 6 minutes
    } else if (timeWindowHours <= 2) {
      labelInterval = 0.167; // 10 minutes
    } else if (timeWindowHours <= 4) {
      labelInterval = 0.25; // 15 minutes
    } else if (timeWindowHours <= 8) {
      labelInterval = 0.5; // 30 minutes
    } else if (timeWindowHours <= 16) {
      labelInterval = 1; // 1 hour
    } else if (timeWindowHours <= 24) {
      labelInterval = 2; // 2 hours
    } else if (timeWindowHours <= 48) {
      labelInterval = 4; // 4 hours
    } else {
      labelInterval = 6; // 6 hours
    }

    const labels = [];
    for (let i = 0; i <= timeWindowHours; i += labelInterval) {
      const time = new Date(startTime.getTime() + i * 60 * 60 * 1000);
      const position = (i / timeWindowHours) * 100; // Position as percentage
      labels.push({
        text: time.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: timezone
        }),
        position: position
      });
    }

    // Process passes
    const passes = satellitePasses
      .map((pass) => {
        const passStart = new Date(pass.event_start);
        const passEnd = new Date(pass.event_end);

        // Skip passes outside the time window
        if (passEnd < startTime || passStart > endTime) {
          return null;
        }

        // Calculate position and width
        const clampedStart = Math.max(passStart.getTime(), startTime.getTime());
        const clampedEnd = Math.min(passEnd.getTime(), endTime.getTime());

        const left = ((clampedStart - startTime.getTime()) / totalDuration) * 100;
        const width = ((clampedEnd - clampedStart) / totalDuration) * 100;

        // Check if pass is currently active using Redux activePass
        const isCurrent = activePass && pass.id === activePass.id;

        return {
          ...pass,
          left,
          width,
          isCurrent,
        };
      })
      .filter(Boolean);

    return {
      timelineData: passes,
      currentTimePosition: currentPosition,
      timeLabels: labels,
      startTime,
      endTime,
      sunData,
    };
  }, [satellitePasses, activePass, timeWindowHours, timeWindowStart, timezone, groundStationLocation, showSunShading, showSunMarkers]);

  const satelliteName = satelliteData?.details?.name || 'Satellite';

  // Handle mouse move over timeline
  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Adjust for Y-axis on left
    const xAdjusted = x - Y_AXIS_WIDTH;
    const availableWidth = rect.width - Y_AXIS_WIDTH;
    const percentage = (xAdjusted / availableWidth) * 100;
    const yPercentage = (y / rect.height) * 100;

    // Handle panning
    if (isPanning && panStartX !== null && panStartTime !== null) {
      const deltaX = x - panStartX;
      const deltaPercentage = (deltaX / availableWidth) * 100;

      // Calculate time shift
      const totalMs = timeWindowHours * 60 * 60 * 1000;
      const timeShift = -(deltaPercentage / 100) * totalMs;

      const newStartTime = new Date(panStartTime + timeShift);
      setTimeWindowStart(newStartTime.getTime());
      // Don't return here, continue to update crosshair
    }

    // Calculate time at this position
    const currentStartTime = timeWindowStart ? new Date(timeWindowStart) : new Date();
    const totalMs = timeWindowHours * 60 * 60 * 1000;
    const timeAtPosition = new Date(currentStartTime.getTime() + (percentage / 100) * totalMs);

    // Find which pass (if any) we're hovering over and calculate actual elevation
    let actualElevation = null;
    for (const pass of timelineData) {
      if (percentage >= pass.left && percentage <= (pass.left + pass.width)) {
        // We're within this pass's time range

        // If we have elevation_curve data, interpolate from actual data
        if (pass.elevation_curve && pass.elevation_curve.length > 0) {
          // Find the two closest points in the elevation curve
          for (let i = 0; i < pass.elevation_curve.length - 1; i++) {
            const point1 = pass.elevation_curve[i];
            const point2 = pass.elevation_curve[i + 1];
            const time1 = new Date(point1.time).getTime();
            const time2 = new Date(point2.time).getTime();

            if (timeAtPosition.getTime() >= time1 && timeAtPosition.getTime() <= time2) {
              // Linear interpolation between the two points
              const t = (timeAtPosition.getTime() - time1) / (time2 - time1);
              actualElevation = point1.elevation + t * (point2.elevation - point1.elevation);
              break;
            }
          }
        } else {
          // Fallback to parabolic curve formula
          const positionInPass = (percentage - pass.left) / pass.width;
          const elevationRatio = 4 * positionInPass * (1 - positionInPass);
          actualElevation = pass.peak_altitude * elevationRatio;
        }
        break;
      }
    }

    setHoverPosition({ x: percentage, y: yPercentage, elevation: actualElevation });
    setHoverTime(timeAtPosition);
  };

  const handleMouseLeave = () => {
    setHoverPosition(null);
    setHoverTime(null);
    setIsPanning(false);
  };

  // Handle mouse down for panning
  const handleMouseDown = (e) => {
    // Enable panning always - can pan to past and future
    setIsPanning(true);
    setPanStartX(e.clientX - e.currentTarget.getBoundingClientRect().left);
    const currentStartTime = timeWindowStart ? new Date(timeWindowStart) : new Date();
    setPanStartTime(currentStartTime.getTime());
    e.currentTarget.style.cursor = 'grabbing';
  };

  // Handle mouse up for panning
  const handleMouseUp = (e) => {
    if (isPanning) {
      setIsPanning(false);
      e.currentTarget.style.cursor = 'grab';
    }
  };

  // Handle mouse wheel for zoom (with Shift key)
  const handleWheel = (e) => {
    if (!e.shiftKey) return;

    e.preventDefault();

    // Get mouse position to calculate time at cursor
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const xAdjusted = x - Y_AXIS_WIDTH;
    const availableWidth = rect.width - Y_AXIS_WIDTH;
    const percentage = (xAdjusted / availableWidth) * 100;

    // Calculate time at mouse position
    const now = new Date();
    const currentStartTime = timeWindowStart ? new Date(timeWindowStart) : new Date(now);
    const totalMs = timeWindowHours * 60 * 60 * 1000;
    const timeAtMouse = new Date(currentStartTime.getTime() + (percentage / 100) * totalMs);

    // Zoom factor: wheel down = zoom out, wheel up = zoom in
    const zoomFactor = e.deltaY > 0 ? ZOOM_FACTOR : (1 / ZOOM_FACTOR);
    const newTimeWindowHours = Math.max(0.5, Math.min(initialTimeWindowHours, timeWindowHours * zoomFactor));

    // Calculate new start time to keep mouse position at the same time
    // timeAtMouse should remain at the same percentage after zoom
    const newTotalMs = newTimeWindowHours * 60 * 60 * 1000;
    const newStartTime = new Date(timeAtMouse.getTime() - (percentage / 100) * newTotalMs);

    setTimeWindowHours(newTimeWindowHours);
    setTimeWindowStart(newStartTime.getTime());
  };

  // Handle touch start
  const handleTouchStart = (e) => {
    if (e.touches.length === 1) {
      // Single touch - start panning
      const touch = e.touches[0];
      const rect = e.currentTarget.getBoundingClientRect();
      const x = touch.clientX - rect.left;

      setIsPanning(true);
      setPanStartX(x);
      const currentStartTime = timeWindowStart ? new Date(timeWindowStart) : new Date();
      setPanStartTime(currentStartTime.getTime());
      setTouchStartTime(currentStartTime.getTime());
    } else if (e.touches.length === 2) {
      // Two touches - start pinch zoom
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const distance = Math.hypot(
        touch2.clientX - touch1.clientX,
        touch2.clientY - touch1.clientY
      );

      setLastTouchDistance(distance);
      setIsPanning(false);

      // Store current time window start for pinch zoom
      const currentStartTime = timeWindowStart ? new Date(timeWindowStart) : new Date();
      setTouchStartTime(currentStartTime.getTime());
    }
  };

  // Handle touch move
  const handleTouchMove = (e) => {
    e.preventDefault();

    if (e.touches.length === 1 && isPanning && panStartX !== null && panStartTime !== null) {
      // Single touch - panning
      const touch = e.touches[0];
      const rect = e.currentTarget.getBoundingClientRect();
      const x = touch.clientX - rect.left;
      const deltaX = x - panStartX;
      const availableWidth = rect.width - Y_AXIS_WIDTH;
      const deltaPercentage = (deltaX / availableWidth) * 100;

      const totalMs = timeWindowHours * 60 * 60 * 1000;
      const timeShift = -(deltaPercentage / 100) * totalMs;

      const newStartTime = new Date(panStartTime + timeShift);
      setTimeWindowStart(newStartTime.getTime());
    } else if (e.touches.length === 2 && lastTouchDistance !== null && touchStartTime !== null) {
      // Two touches - pinch zoom
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const rect = e.currentTarget.getBoundingClientRect();

      const currentDistance = Math.hypot(
        touch2.clientX - touch1.clientX,
        touch2.clientY - touch1.clientY
      );

      // Calculate zoom based on pinch distance change from original
      const zoomRatio = currentDistance / lastTouchDistance;
      const newTimeWindowHours = Math.max(0.5, Math.min(initialTimeWindowHours, initialTimeWindowHours / zoomRatio));

      // Calculate center point between two touches
      const centerX = (touch1.clientX + touch2.clientX) / 2 - rect.left;
      const xAdjusted = centerX - Y_AXIS_WIDTH;
      const availableWidth = rect.width - Y_AXIS_WIDTH;
      const percentage = Math.max(0, Math.min(100, (xAdjusted / availableWidth) * 100));

      // Calculate time at center point using the ORIGINAL start time
      const originalStartTime = new Date(touchStartTime);
      const originalTotalMs = initialTimeWindowHours * 60 * 60 * 1000;
      const timeAtCenter = new Date(originalStartTime.getTime() + (percentage / 100) * originalTotalMs);

      // Calculate new start time to keep center point at the same time
      const newTotalMs = newTimeWindowHours * 60 * 60 * 1000;
      const newStartTime = new Date(timeAtCenter.getTime() - (percentage / 100) * newTotalMs);

      setTimeWindowHours(newTimeWindowHours);
      setTimeWindowStart(newStartTime.getTime());
    }
  };

  // Handle touch end
  const handleTouchEnd = (e) => {
    if (e.touches.length === 0) {
      setIsPanning(false);
      setLastTouchDistance(null);
      setPanStartX(null);
      setPanStartTime(null);
    } else if (e.touches.length === 1) {
      // Went from 2 touches to 1, restart panning
      setLastTouchDistance(null);
      const touch = e.touches[0];
      const rect = e.currentTarget.getBoundingClientRect();
      const x = touch.clientX - rect.left;

      setIsPanning(true);
      setPanStartX(x);
      const currentStartTime = timeWindowStart ? new Date(timeWindowStart) : new Date();
      setPanStartTime(currentStartTime.getTime());
    }
  };

  const formatHoverTime = (date) => {
    if (!date) return '';
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZone: timezone
    });
  };

  // Zoom controls
  const handleZoomIn = () => {
    const newTimeWindowHours = Math.max(0.5, timeWindowHours / ZOOM_FACTOR);
    setTimeWindowHours(newTimeWindowHours);
  };

  const handleZoomOut = () => {
    const newTimeWindowHours = Math.min(initialTimeWindowHours, timeWindowHours * ZOOM_FACTOR);
    setTimeWindowHours(newTimeWindowHours);
  };

  const handleResetZoom = () => {
    setTimeWindowHours(initialTimeWindowHours);
    setTimeWindowStart(null);
  };

  return (
    <TimelineContainer>
      <TitleBar className={getClassNamesBasedOnGridEditing(gridEditable, ["window-title-bar"])}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', height: '100%' }}>
          <Box>
            {t('pass_timeline.title', { name: satelliteName, hours: timeWindowHours.toFixed(1) })}
          </Box>
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <Tooltip title="Zoom In">
              <IconButton
                size="small"
                onClick={handleZoomIn}
                disabled={timeWindowHours <= 0.5}
                sx={{ padding: '2px' }}
              >
                <ZoomInIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Zoom Out">
              <IconButton
                size="small"
                onClick={handleZoomOut}
                disabled={timeWindowHours >= initialTimeWindowHours}
                sx={{ padding: '2px' }}
              >
                <ZoomOutIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Reset Zoom">
              <IconButton
                size="small"
                onClick={handleResetZoom}
                disabled={timeWindowHours === initialTimeWindowHours && timeWindowStart === null}
                sx={{ padding: '2px' }}
              >
                <RestartAltIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>
      </TitleBar>
      <TimelineContent>
        <TimelineCanvas
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onWheel={handleWheel}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          sx={{
            cursor: isPanning ? 'grabbing' : 'grab',
            touchAction: 'none', // Prevent default touch behavior
          }}
        >
          {/* Container for grid lines - matches chart area only */}
          <Box
            sx={{
              position: 'absolute',
              left: `${Y_AXIS_WIDTH}px`,
              right: 0,
              top: `${Y_AXIS_TOP_MARGIN}px`,
              bottom: `${X_AXIS_HEIGHT}px`,
              pointerEvents: 'none',
              zIndex: 1,
            }}
          >
            {/* Horizontal grid lines at degree positions - using UNIFIED COORDINATE SYSTEM */}
            {[75, 60, 45, 30, 15].map((degree, index) => {
              // Use UNIFIED COORDINATE SYSTEM: elevationToYPercent
              const yPercent = elevationToYPercent(degree);
              // Increasing brightness from 0.1 to 0.3
              const opacity = 0.1 + (index * 0.05);

              return (
                <Box
                  key={degree}
                  sx={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    top: `${yPercent}%`,
                    height: '0px',
                    borderTop: `1px solid ${theme.palette.grey[500]}`,
                    opacity: opacity,
                    pointerEvents: 'none',
                  }}
                />
              );
            })}
          </Box>

          {/* Sun shading - night periods */}
          {showSunShading && sunData.nightPeriods.map((period, index) => {
            const totalDuration = endTime.getTime() - startTime.getTime();
            const leftPercent = ((period.start - startTime.getTime()) / totalDuration) * 100;
            const widthPercent = ((period.end - period.start) / totalDuration) * 100;

            return (
              <Box
                key={`night-${index}`}
                sx={{
                  position: 'absolute',
                  left: `calc(${Y_AXIS_WIDTH}px + (100% - ${Y_AXIS_WIDTH}px) * ${leftPercent / 100})`,
                  width: `calc((100% - ${Y_AXIS_WIDTH}px) * ${widthPercent / 100})`,
                  top: 0,
                  bottom: `${X_AXIS_HEIGHT}px`,
                  backgroundColor: theme.palette.mode === 'dark' ? 'rgba(0, 0, 0, 0.3)' : 'rgba(0, 0, 0, 0.15)',
                  pointerEvents: 'none',
                  zIndex: 2,
                }}
              />
            );
          })}

          {/* Sun event markers - sunrise/sunset lines */}
          {showSunMarkers && sunData.sunEvents.map((event, index) => {
            const totalDuration = endTime.getTime() - startTime.getTime();
            const position = ((event.time - startTime.getTime()) / totalDuration) * 100;
            const leftPosition = `calc(${Y_AXIS_WIDTH}px + (100% - ${Y_AXIS_WIDTH}px) * ${position / 100})`;
            const isSunrise = event.type === 'sunrise';
            const color = isSunrise ? theme.palette.warning.main : theme.palette.info.main;

            // Always center labels on their vertical lines
            const labelTransform = 'translateX(-50%)';

            return (
              <React.Fragment key={`sun-${index}`}>
                {/* Vertical line */}
                <Box
                  sx={{
                    position: 'absolute',
                    left: leftPosition,
                    top: `${Y_AXIS_TOP_MARGIN}px`,
                    bottom: `${X_AXIS_HEIGHT}px`,
                    width: '2px',
                    backgroundColor: color,
                    opacity: 0.6,
                    pointerEvents: 'none',
                    zIndex: 3,
                  }}
                />
                {/* Label at top */}
                <Box
                  sx={{
                    position: 'absolute',
                    left: leftPosition,
                    top: `${Y_AXIS_TOP_MARGIN - 18}px`,
                    transform: labelTransform,
                    fontSize: '0.65rem',
                    fontWeight: 'bold',
                    color: color,
                    backgroundColor: theme.palette.background.paper,
                    padding: '2px 4px',
                    borderRadius: '2px',
                    border: `1px solid ${color}`,
                    whiteSpace: 'nowrap',
                    pointerEvents: 'none',
                    zIndex: 3,
                    minWidth: '60px',
                    textAlign: 'center',
                  }}
                >
                  {isSunrise ? '☀ Sunrise' : '☾ Sunset'}
                </Box>
              </React.Fragment>
            );
          })}

          {/* No data message */}
          {(!satellitePasses || satellitePasses.length === 0 || timelineData.length === 0) && (
            <Box
              sx={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                textAlign: 'center',
                pointerEvents: 'none',
              }}
            >
              <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                {!satellitePasses || satellitePasses.length === 0
                  ? 'No satellite passes available'
                  : `No passes in the next ${timeWindowHours.toFixed(1)} hours`}
              </Typography>
            </Box>
          )}

          {/* Pass curves */}
          {timelineData.map((pass) => (
            <Box
              key={pass.id}
              sx={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
              }}
            >
              <PassCurve pass={pass} startTime={startTime} endTime={endTime} />
            </Box>
          ))}

          {/* Current time marker - only show when satellite passes exist */}
          {satellitePasses && satellitePasses.length > 0 && (
            <CurrentTimeMarker position={currentTimePosition} />
          )}

          {/* Hover indicator */}
          {hoverPosition !== null && (() => {
            const hoverLeft = `calc(${Y_AXIS_WIDTH}px + (100% - ${Y_AXIS_WIDTH}px) * ${hoverPosition.x / 100})`;
            // Adjust label position to prevent overflow at edges
            const isNearRightEdge = hoverPosition.x > 85;
            const isNearLeftEdge = hoverPosition.x < 15;
            let labelTransform = 'translateX(-50%)';
            if (isNearRightEdge) {
              labelTransform = 'translateX(calc(-100% + 1px))'; // Touch left side of line
            } else if (isNearLeftEdge) {
              labelTransform = 'translateX(-1px)'; // Touch right side of line
            }

            return (
              <>
                {/* Vertical line */}
                <Box
                  sx={{
                    position: 'absolute',
                    left: hoverLeft,
                    top: `${Y_AXIS_TOP_MARGIN}px`,
                    bottom: `${X_AXIS_HEIGHT}px`,
                    width: '1px',
                    borderLeft: `1px dashed ${theme.palette.text.secondary}`,
                    opacity: 0.7,
                    pointerEvents: 'none',
                    zIndex: 15,
                  }}
                />
                {/* Horizontal line */}
                <Box
                  sx={{
                    position: 'absolute',
                    top: `${hoverPosition.y}%`,
                    left: `${Y_AXIS_WIDTH}px`,
                    right: 0,
                    height: '1px',
                    borderTop: `1px dashed ${theme.palette.text.secondary}`,
                    opacity: 0.7,
                    pointerEvents: 'none',
                    zIndex: 15,
                  }}
                />
                {/* Time tooltip */}
                <Box
                  sx={{
                    position: 'absolute',
                    left: hoverLeft,
                    top: '5px',
                    transform: labelTransform,
                    backgroundColor: theme.palette.background.paper,
                    border: `1px solid ${theme.palette.divider}`,
                    borderRadius: '4px',
                    padding: '4px 8px',
                    fontSize: '0.75rem',
                    fontWeight: 'bold',
                    color: theme.palette.text.primary,
                    whiteSpace: 'nowrap',
                    pointerEvents: 'none',
                    zIndex: 25,
                    boxShadow: theme.shadows[2],
                  }}
                >
                  {formatHoverTime(hoverTime)}
                </Box>
              {/* Elevation tooltip */}
              {hoverPosition.elevation !== null && (
                <Box
                  sx={{
                    position: 'absolute',
                    top: `${hoverPosition.y}%`,
                    right: '5px',
                    transform: 'translateY(-50%)',
                    backgroundColor: theme.palette.background.paper,
                    border: `1px solid ${theme.palette.divider}`,
                    borderRadius: '4px',
                    padding: '4px 8px',
                    fontSize: '0.75rem',
                    fontWeight: 'bold',
                    color: theme.palette.text.primary,
                    whiteSpace: 'nowrap',
                    pointerEvents: 'none',
                    zIndex: 25,
                    boxShadow: theme.shadows[2],
                  }}
                >
                  {`${hoverPosition.elevation.toFixed(1)}°`}
                </Box>
              )}
              </>
            );
          })()}

          {/* Elevation axis (Y-axis on left) - using UNIFIED COORDINATE SYSTEM */}
          <ElevationAxis>
            {[90, 75, 60, 45, 30, 15, 0].map((degree) => {
              // Use UNIFIED COORDINATE SYSTEM for positioning
              const yPercent = elevationToYPercent(degree);
              return (
                <ElevationLabel key={degree} sx={{ top: `${yPercent}%` }}>
                  {degree}°
                </ElevationLabel>
              );
            })}
          </ElevationAxis>

          {/* Top corner box (fills gap at top of Y-axis) */}
          <Box
            sx={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: `${Y_AXIS_WIDTH}px`,
              height: `${Y_AXIS_TOP_MARGIN}px`,
              backgroundColor: theme.palette.background.default,
              borderRight: `1px solid ${theme.palette.divider}`,
            }}
          />

          {/* Bottom corner box (fills gap between axes) */}
          <Box
            sx={{
              position: 'absolute',
              left: 0,
              bottom: 0,
              width: `${Y_AXIS_WIDTH}px`,
              height: `${X_AXIS_HEIGHT}px`,
              backgroundColor: theme.palette.background.default,
              borderRight: `1px solid ${theme.palette.divider}`,
            }}
          />

          {/* Time axis */}
          <TimelineAxis sx={{ left: `${Y_AXIS_WIDTH}px`, width: `calc(100% - ${Y_AXIS_WIDTH}px)` }}>
            {timeLabels.map((label, index) => (
              <TimeLabel key={index} sx={{ left: `${label.position}%` }}>
                {label.text}
              </TimeLabel>
            ))}
          </TimelineAxis>
        </TimelineCanvas>
      </TimelineContent>
    </TimelineContainer>
  );
};

export default SatellitePassTimeline;
