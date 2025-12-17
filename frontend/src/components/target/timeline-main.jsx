import React, { useMemo, useState, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Box, Typography, Tooltip, useTheme, IconButton, CircularProgress } from '@mui/material';
import { TitleBar, getClassNamesBasedOnGridEditing } from '../common/common.jsx';
import { useTranslation } from 'react-i18next';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import RefreshIcon from '@mui/icons-material/Refresh';
import SunCalc from 'suncalc';

// Import from extracted modules
import { Y_AXIS_WIDTH, X_AXIS_HEIGHT, Y_AXIS_TOP_MARGIN, ZOOM_FACTOR, elevationToYPercent } from './timeline-constants.jsx';
import { TimelineContainer, TimelineContent, TimelineCanvas, TimelineAxis, ElevationAxis, ElevationLabel, TimeLabel } from './timeline-styles.jsx';
import { PassCurve, CurrentTimeMarker, PassTooltipContent } from './timeline-components.jsx';
import { useTimelineEvents } from './timeline-events.jsx';

const SatellitePassTimelineComponent = ({
  timeWindowHours: initialTimeWindowHours = 8,
  pastOffsetHours = 0.5, // Hours to offset into the past on initial render (30 minutes)
  showSunShading = true,
  showSunMarkers = true,
  satelliteName = null,
  singlePassMode = false, // New prop: if true, show only the active pass
  passId = null, // New prop: specific pass ID to show (optional, used with singlePassMode)
  showTitleBar = true, // New prop: if false, hide the title bar
  minLabelInterval = null, // New prop: minimum interval between labels in hours (null = auto-calculate)
  passesOverride = null, // New prop: override passes from Redux (for overview page)
  activePassOverride = null, // New prop: override active pass from Redux
  gridEditableOverride = null, // New prop: override gridEditable from Redux
  labelType = false, // New prop: 'name' for satellite name, 'peak' for elevation value, false for no labels
  cachedOverride = null, // New prop: override cached flag (for overview page)
  labelVerticalOffset = 150, // New prop: percentage offset for label positioning (higher = further above peak)
  loading = false, // New prop: show loading overlay
  nextPassesHours = null, // New prop: forecast window in hours (null = use initialTimeWindowHours)
  onRefresh = null, // New prop: callback for refresh button
}) => {
  const theme = useTheme();
  const { t } = useTranslation('target');
  const dispatch = useDispatch();

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

  // Pan state - use refs to avoid re-renders during panning
  const [isPanning, setIsPanning] = useState(false);
  const panStartXRef = useRef(null);
  const panStartTimeRef = useRef(null);

  // Touch state - use refs to avoid re-renders during touch gestures
  const lastTouchDistanceRef = useRef(null);
  const touchStartTimeRef = useRef(null);
  const touchStartZoomLevelRef = useRef(null);

  // Get satellite passes from Redux store with proper equality checks
  // Allow override from props for multi-satellite view (overview page)
  const satellitePassesFromRedux = useSelector((state) => state.targetSatTrack.satellitePasses);
  const activePassFromRedux = useSelector((state) => state.targetSatTrack.activePass);
  const gridEditableFromRedux = useSelector((state) => state.targetSatTrack.gridEditable);

  const satellitePasses = passesOverride !== null ? passesOverride : satellitePassesFromRedux;
  const activePass = activePassOverride !== undefined ? activePassOverride : activePassFromRedux;
  const gridEditable = gridEditableOverride !== null ? gridEditableOverride : gridEditableFromRedux;
  const groundStationLocation = useSelector((state) => state.location.location);

  // Get timezone from preferences - memoized selector to avoid re-renders
  const timezone = useSelector((state) => {
    const timezonePref = state.preferences.preferences.find((pref) => pref.name === 'timezone');
    return timezonePref ? timezonePref.value : 'UTC';
  }, (prev, next) => prev === next); // Use equality check

  const { timelineData, timeLabels, startTime, endTime, sunData, activePassObj } = useMemo(() => {
    const now = new Date();

    // In single-pass mode, determine the active pass and set time window accordingly
    let activePassObj = null;
    let startTime, endTime;

    if (singlePassMode && satellitePasses && satellitePasses.length > 0) {
      // Find the active pass (either specified by passId or determine current pass)
      if (passId) {
        activePassObj = satellitePasses.find(pass => pass.id === passId);
      } else {
        // Determine current active pass based on current time
        activePassObj = satellitePasses.find(pass => {
          const passStart = new Date(pass.event_start);
          const passEnd = new Date(pass.event_end);
          return now >= passStart && now <= passEnd;
        });
      }

      // If we found an active pass, set time window based on elevation curve time range
      if (activePassObj) {
        // Use elevation curve times if available (includes the 30-minute extension for first pass)
        if (activePassObj.elevation_curve && activePassObj.elevation_curve.length > 0) {
          startTime = new Date(activePassObj.elevation_curve[0].time);
          endTime = new Date(activePassObj.elevation_curve[activePassObj.elevation_curve.length - 1].time);
        } else {
          // Fallback to event times
          startTime = new Date(activePassObj.event_start);
          endTime = new Date(activePassObj.event_end);
        }
      } else {
        // No active pass found, fall back to normal mode
        startTime = timeWindowStart ? new Date(timeWindowStart) : new Date(now);
        endTime = new Date(startTime.getTime() + timeWindowHours * 60 * 60 * 1000);
      }
    } else {
      // Normal mode: use time window configuration
      startTime = timeWindowStart ? new Date(timeWindowStart) : new Date(now);
      endTime = new Date(startTime.getTime() + timeWindowHours * 60 * 60 * 1000);
    }

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
      return { timelineData: [], timeLabels: [], startTime, endTime, sunData };
    }

    const totalDuration = endTime.getTime() - startTime.getTime();
    const actualTimeWindowHours = totalDuration / (1000 * 60 * 60); // Convert ms to hours

    // Generate time labels with dynamic interval based on zoom level
    const labels = [];

    if (singlePassMode) {
      // In single-pass mode, calculate label count to prevent overlap
      // Assume average label width is ~70px (for HH:MM format), plus ~30px spacing for safety
      const estimatedLabelWidth = 100; // px - generous spacing to prevent any overlap
      const chartWidthPixels = window.innerWidth * 0.35; // Estimate based on typical popover width (~35% of viewport)
      const availableChartWidth = chartWidthPixels - Y_AXIS_WIDTH; // Subtract Y-axis width
      const maxLabelsByWidth = Math.floor(availableChartWidth / estimatedLabelWidth);

      // Also calculate based on time duration (prefer ~3-5 minute intervals for readability)
      let targetIntervalMinutes;
      if (actualTimeWindowHours <= 0.25) { // <= 15 minutes
        targetIntervalMinutes = 3;
      } else if (actualTimeWindowHours <= 0.5) { // <= 30 minutes
        targetIntervalMinutes = 5;
      } else { // > 30 minutes
        targetIntervalMinutes = 10;
      }
      const targetIntervalHours = targetIntervalMinutes / 60;
      const labelCountByTime = Math.max(3, Math.ceil(actualTimeWindowHours / targetIntervalHours) + 1);

      // Use the minimum of the two calculations to prevent overlap
      const labelCount = Math.max(3, Math.min(maxLabelsByWidth, labelCountByTime, 8)); // Min 3, max 8

      for (let i = 0; i < labelCount; i++) {
        const fraction = i / (labelCount - 1); // 0 to 1
        const time = new Date(startTime.getTime() + fraction * totalDuration);
        const position = fraction * 100;
        labels.push({
          text: time.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: timezone
          }),
          position: position
        });
      }
    } else {
      // Normal mode: use dynamic interval based on zoom level
      let labelInterval;

      // If minLabelInterval is specified, use it directly
      if (minLabelInterval !== null) {
        labelInterval = minLabelInterval;
      } else {
        // Auto-calculate based on time window
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
      }

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
    }

    // Process passes
    let passesToProcess = satellitePasses;

    // In single-pass mode, only show the active pass
    if (singlePassMode && activePassObj) {
      passesToProcess = [activePassObj];
    }

    const passes = passesToProcess
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
      timeLabels: labels,
      startTime,
      endTime,
      sunData,
      activePassObj,
    };
  }, [satellitePasses, activePass, timeWindowHours, timeWindowStart, timezone, groundStationLocation, showSunShading, showSunMarkers, singlePassMode, passId, minLabelInterval]);

  // Event handlers
  const {
    handleMouseMove,
    handleMouseLeave,
    handleMouseDown,
    handleMouseUp,
    handleWheel,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    formatHoverTime,
    handleZoomIn,
    handleZoomOut,
    handleResetZoom,
  } = useTimelineEvents({
    isPanning,
    setIsPanning,
    timeWindowHours,
    setTimeWindowHours,
    timeWindowStart,
    setTimeWindowStart,
    timelineData,
    setHoverPosition,
    setHoverTime,
    initialTimeWindowHours,
    panStartXRef,
    panStartTimeRef,
    lastTouchDistanceRef,
    touchStartTimeRef,
    touchStartZoomLevelRef,
    timezone,
    startTime,
    endTime,
    pastOffsetHours,
    nextPassesHours: nextPassesHours !== null ? nextPassesHours : initialTimeWindowHours,
  });

  return (
    <TimelineContainer>
      {showTitleBar && (
        <TitleBar
          className={getClassNamesBasedOnGridEditing(gridEditable, ["window-title-bar"])}
          sx={{
            bgcolor: 'background.default',
            borderBottom: '1px solid',
            borderColor: 'border.main',
            backdropFilter: 'blur(10px)'
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', height: '100%' }}>
            <Box sx={{display: 'flex', alignItems: 'center', gap: 1}}>
              <Typography variant="subtitle2" sx={{fontWeight: 'bold'}}>
                {satelliteName
                  ? `${satelliteName} - Visibility curves for the next ${initialTimeWindowHours.toFixed(0)} hours`
                  : `Visibility curves for the next ${initialTimeWindowHours.toFixed(0)} hours`
                }
              </Typography>
              {cachedOverride && (
                <Typography variant="caption" sx={{
                  fontStyle: 'italic',
                  color: 'text.secondary',
                  opacity: 0.7
                }}>
                  (cached)
                </Typography>
              )}
            </Box>
            {!singlePassMode && (
              <Box sx={{ display: 'flex', gap: 0.5 }}>
                {onRefresh && (
                  <Tooltip title="Refresh passes (force recalculate)">
                    <span>
                      <IconButton
                        size="small"
                        onClick={onRefresh}
                        disabled={loading}
                        sx={{ padding: '2px' }}
                      >
                        <RefreshIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                )}
                <Tooltip title={t('timeline.zoomIn')}>
                  <span>
                    <IconButton
                      size="small"
                      onClick={handleZoomIn}
                      disabled={timeWindowHours <= 0.5}
                      sx={{ padding: '2px' }}
                    >
                      <ZoomInIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title={t('timeline.zoomOut')}>
                  <span>
                    <IconButton
                      size="small"
                      onClick={handleZoomOut}
                      disabled={timeWindowHours >= initialTimeWindowHours}
                      sx={{ padding: '2px' }}
                    >
                      <ZoomOutIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title={t('timeline.resetZoom')}>
                  <span>
                    <IconButton
                      size="small"
                      onClick={handleResetZoom}
                      disabled={timeWindowHours === initialTimeWindowHours && timeWindowStart === null}
                      sx={{ padding: '2px' }}
                    >
                      <RestartAltIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
              </Box>
            )}
          </Box>
        </TitleBar>
      )}
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
                  top: `${Y_AXIS_TOP_MARGIN}px`,
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
            const color = isSunrise ? '#6b5110' : '#2a5070'; // Very muted dark gold for sunrise, very muted dark steel blue for sunset

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
                    opacity: 0.8,
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
                    opacity: 0.8,
                  }}
                >
                  {isSunrise ? `☀ ${t('timeline.sunrise')}` : `☾ ${t('timeline.sunset')}`}
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
                  ? t('timeline.noPassesAvailable')
                  : t('timeline.noPassesForSelected', { hours: timeWindowHours.toFixed(1) })}
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
              <PassCurve pass={pass} startTime={startTime} endTime={endTime} labelType={labelType} labelVerticalOffset={labelVerticalOffset} />
            </Box>
          ))}

          {/* Current time marker - only show when satellite passes exist */}
          {satellitePasses && satellitePasses.length > 0 && (
            <CurrentTimeMarker startTime={startTime} endTime={endTime} />
          )}

          {/* Hover indicator */}
          {hoverPosition !== null && (() => {
            const hoverLeft = `calc(${Y_AXIS_WIDTH}px + (100% - ${Y_AXIS_WIDTH}px) * ${hoverPosition.x / 100})`;

            // Calculate Y position for elevation marker on curve
            const elevationYPercent = hoverPosition.elevation !== null
              ? elevationToYPercent(hoverPosition.elevation)
              : null;

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
                    borderLeft: `1px solid ${theme.palette.text.secondary}`,
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
                {/* Elevation marker on curve */}
                {hoverPosition.elevation !== null && elevationYPercent !== null && (
                  <Box
                    sx={{
                      position: 'absolute',
                      left: hoverLeft,
                      top: `calc(${Y_AXIS_TOP_MARGIN}px + (100% - ${Y_AXIS_TOP_MARGIN}px - ${X_AXIS_HEIGHT}px) * ${elevationYPercent / 100})`,
                      transform: 'translate(-50%, -50%)',
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

        {/* Loading overlay */}
        {loading && (
          <Box
            sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
            }}
          >
            <CircularProgress size={40} thickness={4} />
          </Box>
        )}
      </TimelineContent>
    </TimelineContainer>
  );
};

// Wrap component in React.memo to prevent re-renders from parent when props haven't changed
// This prevents the 2-second satellite position updates from causing timeline re-renders
export const SatellitePassTimeline = React.memo(SatellitePassTimelineComponent);

export default SatellitePassTimeline;
