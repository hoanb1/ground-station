import { useCallback } from 'react';
import { Y_AXIS_WIDTH, ZOOM_FACTOR } from './timeline-constants.jsx';

/**
 * Custom hook that returns all event handlers for the timeline component
 */
export const useTimelineEvents = ({
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
}) => {

  const handleMouseMove = useCallback((e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Adjust for Y-axis on left
    const xAdjusted = x - Y_AXIS_WIDTH;
    const availableWidth = rect.width - Y_AXIS_WIDTH;
    const percentage = (xAdjusted / availableWidth) * 100;
    const yPercentage = (y / rect.height) * 100;

    // Handle panning
    if (isPanning && panStartXRef.current !== null && panStartTimeRef.current !== null) {
      const deltaX = x - panStartXRef.current;
      const deltaPercentage = (deltaX / availableWidth) * 100;

      // Calculate time shift
      const totalMs = timeWindowHours * 60 * 60 * 1000;
      const timeShift = -(deltaPercentage / 100) * totalMs;

      const newStartTime = new Date(panStartTimeRef.current + timeShift);
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
  }, [isPanning, timeWindowHours, timeWindowStart, timelineData, panStartXRef, panStartTimeRef, setTimeWindowStart, setHoverPosition, setHoverTime]);

  const handleMouseLeave = useCallback(() => {
    setHoverPosition(null);
    setHoverTime(null);
    setIsPanning(false);
    panStartXRef.current = null;
    panStartTimeRef.current = null;
  }, [setHoverPosition, setHoverTime, setIsPanning, panStartXRef, panStartTimeRef]);

  const handleMouseDown = useCallback((e) => {
    // Enable panning always - can pan to past and future
    setIsPanning(true);
    panStartXRef.current = e.clientX - e.currentTarget.getBoundingClientRect().left;
    const currentStartTime = timeWindowStart ? new Date(timeWindowStart) : new Date();
    panStartTimeRef.current = currentStartTime.getTime();
    e.currentTarget.style.cursor = 'grabbing';
  }, [timeWindowStart, setIsPanning, panStartXRef, panStartTimeRef]);

  const handleMouseUp = useCallback((e) => {
    if (isPanning) {
      setIsPanning(false);
      e.currentTarget.style.cursor = 'grab';
    }
  }, [isPanning, setIsPanning]);

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
    const newTotalMs = newTimeWindowHours * 60 * 60 * 1000;
    const newStartTime = new Date(timeAtMouse.getTime() - (percentage / 100) * newTotalMs);

    setTimeWindowHours(newTimeWindowHours);
    setTimeWindowStart(newStartTime.getTime());
  };

  const handleTouchStart = useCallback((e) => {
    if (e.touches.length === 1) {
      // Single touch - start panning
      const touch = e.touches[0];
      const rect = e.currentTarget.getBoundingClientRect();
      const x = touch.clientX - rect.left;

      setIsPanning(true);
      panStartXRef.current = x;
      const currentStartTime = timeWindowStart ? new Date(timeWindowStart) : new Date();
      panStartTimeRef.current = currentStartTime.getTime();
      touchStartTimeRef.current = currentStartTime.getTime();
    } else if (e.touches.length === 2) {
      // Two touches - start pinch zoom
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const distance = Math.hypot(
        touch2.clientX - touch1.clientX,
        touch2.clientY - touch1.clientY
      );

      lastTouchDistanceRef.current = distance;
      setIsPanning(false);

      // Store current time window start and zoom level for pinch zoom
      const currentStartTime = timeWindowStart ? new Date(timeWindowStart) : new Date();
      touchStartTimeRef.current = currentStartTime.getTime();
      touchStartZoomLevelRef.current = timeWindowHours; // Store CURRENT zoom level
    }
  }, [timeWindowStart, timeWindowHours, setIsPanning, panStartXRef, panStartTimeRef, touchStartTimeRef, lastTouchDistanceRef, touchStartZoomLevelRef]);

  const handleTouchMove = useCallback((e) => {
    e.preventDefault();

    if (e.touches.length === 1 && isPanning && panStartXRef.current !== null && panStartTimeRef.current !== null) {
      // Single touch - panning
      const touch = e.touches[0];
      const rect = e.currentTarget.getBoundingClientRect();
      const x = touch.clientX - rect.left;
      const deltaX = x - panStartXRef.current;
      const availableWidth = rect.width - Y_AXIS_WIDTH;
      const deltaPercentage = (deltaX / availableWidth) * 100;

      const totalMs = timeWindowHours * 60 * 60 * 1000;
      const timeShift = -(deltaPercentage / 100) * totalMs;

      const newStartTime = new Date(panStartTimeRef.current + timeShift);
      setTimeWindowStart(newStartTime.getTime());
    } else if (e.touches.length === 2 && lastTouchDistanceRef.current !== null && touchStartTimeRef.current !== null && touchStartZoomLevelRef.current !== null) {
      // Two touches - pinch zoom
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const rect = e.currentTarget.getBoundingClientRect();

      const currentDistance = Math.hypot(
        touch2.clientX - touch1.clientX,
        touch2.clientY - touch1.clientY
      );

      // Calculate zoom based on pinch distance change from the STARTING zoom level
      const zoomRatio = currentDistance / lastTouchDistanceRef.current;
      const startingZoomLevel = touchStartZoomLevelRef.current;
      const newTimeWindowHours = Math.max(0.5, Math.min(initialTimeWindowHours, startingZoomLevel / zoomRatio));

      // Calculate center point between two touches
      const centerX = (touch1.clientX + touch2.clientX) / 2 - rect.left;
      const xAdjusted = centerX - Y_AXIS_WIDTH;
      const availableWidth = rect.width - Y_AXIS_WIDTH;
      const percentage = Math.max(0, Math.min(100, (xAdjusted / availableWidth) * 100));

      // Calculate time at center point using the ORIGINAL start time and zoom level
      const originalStartTime = new Date(touchStartTimeRef.current);
      const originalTotalMs = startingZoomLevel * 60 * 60 * 1000;
      const timeAtCenter = new Date(originalStartTime.getTime() + (percentage / 100) * originalTotalMs);

      // Calculate new start time to keep center point at the same time
      const newTotalMs = newTimeWindowHours * 60 * 60 * 1000;
      const newStartTime = new Date(timeAtCenter.getTime() - (percentage / 100) * newTotalMs);

      setTimeWindowHours(newTimeWindowHours);
      setTimeWindowStart(newStartTime.getTime());
    }
  }, [isPanning, timeWindowHours, initialTimeWindowHours, panStartXRef, panStartTimeRef, lastTouchDistanceRef, touchStartTimeRef, touchStartZoomLevelRef, setTimeWindowStart, setTimeWindowHours]);

  const handleTouchEnd = useCallback((e) => {
    if (e.touches.length === 0) {
      setIsPanning(false);
      lastTouchDistanceRef.current = null;
      panStartXRef.current = null;
      panStartTimeRef.current = null;
    } else if (e.touches.length === 1) {
      // Went from 2 touches to 1, restart panning
      lastTouchDistanceRef.current = null;
      const touch = e.touches[0];
      const rect = e.currentTarget.getBoundingClientRect();
      const x = touch.clientX - rect.left;

      setIsPanning(true);
      panStartXRef.current = x;
      const currentStartTime = timeWindowStart ? new Date(timeWindowStart) : new Date();
      panStartTimeRef.current = currentStartTime.getTime();
    }
  }, [timeWindowStart, setIsPanning, lastTouchDistanceRef, panStartXRef, panStartTimeRef]);

  const formatHoverTime = (date) => {
    if (!date) return '';
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZone: timezone
    });
  };

  const handleZoomIn = () => {
    const newTimeWindowHours = Math.max(0.5, timeWindowHours / ZOOM_FACTOR);
    setTimeWindowHours(newTimeWindowHours);
  };

  const handleZoomOut = () => {
    const newTimeWindowHours = Math.min(initialTimeWindowHours, timeWindowHours * ZOOM_FACTOR);
    setTimeWindowHours(newTimeWindowHours);
  };

  const handleResetZoom = useCallback(() => {
    setTimeWindowHours(initialTimeWindowHours);
    // Set start time to 2 hours in the past
    const now = new Date();
    const pastOffsetHours = 2;
    setTimeWindowStart(now.getTime() - (pastOffsetHours * 60 * 60 * 1000));
  }, [initialTimeWindowHours, setTimeWindowHours, setTimeWindowStart]);

  return {
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
  };
};
