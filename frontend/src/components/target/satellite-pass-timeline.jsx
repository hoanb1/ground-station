import React, { useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { Box, Paper, Typography, Tooltip, useTheme } from '@mui/material';
import { styled } from '@mui/material/styles';
import { TitleBar, getClassNamesBasedOnGridEditing } from '../common/common.jsx';
import { useTranslation } from 'react-i18next';

// Constants
const Y_AXIS_WIDTH = 25; // Width of elevation axis in pixels
const X_AXIS_HEIGHT = 30; // Height of time axis in pixels

const TimelineContainer = styled(Box)(({ theme }) => ({
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  backgroundColor: theme.palette.background.paper,
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
  overflow: 'visible',
  padding: '0 4px',
}));

const TimelineAxis = styled(Box)(({ theme }) => ({
  position: 'absolute',
  bottom: 0,
  left: 0,
  right: 0,
  height: `${X_AXIS_HEIGHT}px`,
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '0 8px',
  borderTop: `1px solid ${theme.palette.divider}`,
  backgroundColor: theme.palette.background.default,
}));

const ElevationAxis = styled(Box)(({ theme }) => ({
  position: 'absolute',
  left: 0,
  top: 0,
  bottom: `${X_AXIS_HEIGHT}px`,
  width: `${Y_AXIS_WIDTH}px`,
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between',
  padding: '4px 0',
  borderRight: `1px solid ${theme.palette.divider}`,
  borderBottom: 'none',
  backgroundColor: theme.palette.background.default,
}));

const ElevationLabel = styled(Typography)(({ theme }) => ({
  fontSize: '0.65rem',
  color: theme.palette.text.secondary,
  userSelect: 'none',
  textAlign: 'right',
  paddingRight: '4px',
}));

const TimeLabel = styled(Typography)(({ theme }) => ({
  fontSize: '0.7rem',
  color: theme.palette.text.secondary,
  userSelect: 'none',
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

  // SVG viewBox coordinates
  // Top of canvas (90°) = Y: 0
  // Bottom of canvas (0°) = Y: 100
  const bottomY = 100;
  const heightRange = 100;

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

      // Calculate X position (0-100% of timeline)
      const x = ((pointTime - startTime.getTime()) / totalDuration) * 100;

      // Calculate Y position (0° = Y:100 bottom, 90° = Y:0 top)
      const y = bottomY - (point.elevation / 90) * heightRange;

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
      const y = bottomY - (elevationAtPoint / 90) * heightRange;
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

  // Close the path to baseline (bottom at Y=100)
  const fillPath = `${pathString} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;

  return (
    <svg
      style={{
        position: 'absolute',
        top: 0,
        left: `${Y_AXIS_WIDTH}px`,
        width: `calc(100% - ${Y_AXIS_WIDTH}px)`,
        height: `calc(100% - ${X_AXIS_HEIGHT}px)`, // Don't overlap time axis
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

  return (
    <Box
      sx={{
        position: 'absolute',
        left: leftPosition,
        top: 0,
        bottom: `${X_AXIS_HEIGHT}px`,
        width: '2px',
        backgroundColor: theme.palette.error.main,
        zIndex: 20,
        boxShadow: `0 0 8px ${theme.palette.error.main}40`,
        '&::before': {
          content: '""',
          position: 'absolute',
          top: '0px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '0',
          height: '0',
          borderLeft: '6px solid transparent',
          borderRight: '6px solid transparent',
          borderTop: `8px solid ${theme.palette.error.main}`,
        },
        '&::after': {
          content: '"NOW"',
          position: 'absolute',
          top: '12px',
          left: '50%',
          transform: 'translateX(-50%)',
          fontSize: '0.65rem',
          fontWeight: 'bold',
          color: theme.palette.error.main,
          backgroundColor: theme.palette.background.paper,
          padding: '2px 4px',
          borderRadius: '2px',
          whiteSpace: 'nowrap',
        },
      }}
    />
  );
};

const PassTooltipContent = ({ pass, isCurrent }) => {
  const formatTime = (isoString) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
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

export const SatellitePassTimeline = ({ timeWindowHours = 8 }) => {
  const theme = useTheme();
  const { t } = useTranslation('target');

  // Mouse hover state
  const [hoverPosition, setHoverPosition] = useState(null);
  const [hoverTime, setHoverTime] = useState(null);

  // Get satellite passes from Redux store
  const satellitePasses = useSelector((state) => state.targetSatTrack.satellitePasses);
  const activePass = useSelector((state) => state.targetSatTrack.activePass);
  const gridEditable = useSelector((state) => state.targetSatTrack.gridEditable);
  const satelliteData = useSelector((state) => state.targetSatTrack.satelliteData);

  const { timelineData, currentTimePosition, timeLabels, startTime, endTime } = useMemo(() => {
    if (!satellitePasses || satellitePasses.length === 0) {
      return { timelineData: [], currentTimePosition: 0, timeLabels: [], startTime: new Date(), endTime: new Date() };
    }

    const now = new Date();
    const startTime = new Date(now);
    const endTime = new Date(now.getTime() + timeWindowHours * 60 * 60 * 1000);

    // Calculate current time position (0-100%)
    const totalDuration = endTime.getTime() - startTime.getTime();
    const currentPosition = ((now.getTime() - startTime.getTime()) / totalDuration) * 100;

    // Generate time labels (every 2 hours)
    const labels = [];
    for (let i = 0; i <= timeWindowHours; i += 2) {
      const time = new Date(startTime.getTime() + i * 60 * 60 * 1000);
      labels.push(time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }));
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
    };
  }, [satellitePasses, activePass, timeWindowHours]);

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

    // Calculate time at this position
    const now = new Date();
    const startTime = new Date(now);
    const totalMs = timeWindowHours * 60 * 60 * 1000;
    const timeAtPosition = new Date(startTime.getTime() + (percentage / 100) * totalMs);

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
  };

  const formatHoverTime = (date) => {
    if (!date) return '';
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  return (
    <TimelineContainer>
      <TitleBar className={getClassNamesBasedOnGridEditing(gridEditable, ["window-title-bar"])}>
        {t('pass_timeline.title', { name: satelliteName, hours: timeWindowHours })}
      </TitleBar>
      <TimelineContent>
        <TimelineCanvas
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          {/* No data message */}
          {(!satellitePasses || satellitePasses.length === 0 || timelineData.length === 0) && (
            <Box
              sx={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                textAlign: 'center',
              }}
            >
              <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                {!satellitePasses || satellitePasses.length === 0
                  ? 'No satellite passes available'
                  : `No passes in the next ${timeWindowHours} hours`}
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

          {/* Current time marker */}
          <CurrentTimeMarker position={currentTimePosition} />

          {/* Hover indicator */}
          {hoverPosition !== null && (() => {
            const hoverLeft = `calc(${Y_AXIS_WIDTH}px + (100% - ${Y_AXIS_WIDTH}px) * ${hoverPosition.x / 100})`;
            return (
              <>
                {/* Vertical line */}
                <Box
                  sx={{
                    position: 'absolute',
                    left: hoverLeft,
                    top: 0,
                    bottom: `${X_AXIS_HEIGHT}px`,
                    width: '1px',
                    backgroundColor: theme.palette.text.secondary,
                    opacity: 0.5,
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
                    backgroundColor: theme.palette.text.secondary,
                    opacity: 0.5,
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
                  transform: 'translateX(-50%)',
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

          {/* Elevation axis (Y-axis on left) */}
          <ElevationAxis>
            {[90, 75, 60, 45, 30, 15, 0].map((degree) => (
              <ElevationLabel key={degree}>{degree}°</ElevationLabel>
            ))}
          </ElevationAxis>

          {/* Corner box (fills gap between axes) */}
          <Box
            sx={{
              position: 'absolute',
              left: 0,
              bottom: 0,
              width: `${Y_AXIS_WIDTH}px`,
              height: `${X_AXIS_HEIGHT}px`,
              backgroundColor: theme.palette.background.default,
              borderTop: `1px solid ${theme.palette.divider}`,
              borderRight: `1px solid ${theme.palette.divider}`,
            }}
          />

          {/* Time axis */}
          <TimelineAxis sx={{ left: `${Y_AXIS_WIDTH}px` }}>
            {timeLabels.map((label, index) => (
              <TimeLabel key={index}>{label}</TimeLabel>
            ))}
          </TimelineAxis>
        </TimelineCanvas>
      </TimelineContent>
    </TimelineContainer>
  );
};

export default SatellitePassTimeline;
