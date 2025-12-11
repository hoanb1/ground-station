/**
 * @license
 * Copyright (c) 2025 Efstratios Goudelis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 *
 */

import React, { useCallback, useEffect, useState, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Box, FormControl, InputLabel, Select, MenuItem, ListSubheader, Chip, Menu, Typography, Badge, Tooltip, ToggleButton, Button } from "@mui/material";
import VisibilityIcon from '@mui/icons-material/Visibility';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import HorizontalRuleIcon from '@mui/icons-material/HorizontalRule';
import { useTranslation } from 'react-i18next';
import { useSocket } from "../common/socket.jsx";
import {
    setSelectedSatGroupId,
    fetchSatellitesByGroupId,
    addRecentSatelliteGroup,
    setRecentSatelliteGroups,
} from './overview-slice.jsx';

const SATELLITE_NUMBER_LIMIT = 200;
const RECENT_GROUPS_KEY = 'satellite-recent-groups';
const MAX_RECENT_GROUPS = 12;
const MIN_PILLS_VISIBLE = 2;

const SatelliteGroupSelectorBar = React.memo(function SatelliteGroupSelectorBar() {
    const dispatch = useDispatch();
    const { t } = useTranslation('overview');
    const { socket } = useSocket();

    const selectedSatGroupId = useSelector(state => state.overviewSatTrack.selectedSatGroupId);
    const satGroups = useSelector(state => state.overviewSatTrack.satGroups);
    const passesLoading = useSelector(state => state.overviewSatTrack.passesLoading);
    const selectedSatellitePositions = useSelector(state => state.overviewSatTrack.selectedSatellitePositions);
    const recentGroups = useSelector(state => state.overviewSatTrack.recentSatelliteGroups);

    const [visibleCount, setVisibleCount] = useState(MAX_RECENT_GROUPS);
    const [anchorEl, setAnchorEl] = useState(null);
    const containerRef = useRef(null);
    const pillRefs = useRef([]);

    // Load recent groups from localStorage on mount and store in Redux
    useEffect(() => {
        try {
            const stored = localStorage.getItem(RECENT_GROUPS_KEY);
            if (stored) {
                const parsedGroups = JSON.parse(stored);
                dispatch(setRecentSatelliteGroups(parsedGroups));
            }
        } catch (e) {
            console.error('Failed to load recent groups:', e);
        }
    }, [dispatch]);

    // Update recent groups when selection changes
    useEffect(() => {
        if (!selectedSatGroupId || selectedSatGroupId === 'none') return;

        const group = satGroups.find(g => g.id === selectedSatGroupId);
        if (!group) return;

        // Add to Redux
        dispatch(addRecentSatelliteGroup({ id: group.id, name: group.name, type: group.type }));

    }, [selectedSatGroupId, satGroups, dispatch]);

    // Persist recentGroups to localStorage whenever it changes
    useEffect(() => {
        if (recentGroups && recentGroups.length > 0) {
            try {
                localStorage.setItem(RECENT_GROUPS_KEY, JSON.stringify(recentGroups));
            } catch (e) {
                console.error('Failed to save recent groups:', e);
            }
        }
    }, [recentGroups]);

    const handleOnGroupChange = useCallback((event) => {
        const satGroupId = event.target.value;
        dispatch(setSelectedSatGroupId(satGroupId));
        dispatch(fetchSatellitesByGroupId({ socket, satGroupId }));
    }, [dispatch, socket]);

    const handleRecentGroupClick = useCallback((groupId) => {
        dispatch(setSelectedSatGroupId(groupId));
        dispatch(fetchSatellitesByGroupId({ socket, satGroupId: groupId }));
        setAnchorEl(null); // Close menu if open
    }, [dispatch, socket]);

    // Get groups to display as pills (recent or fallback to first few from dropdown)
    // Include satellite count for each group
    const pillGroups = recentGroups.length > 0
        ? recentGroups.map(rg => {
            const group = satGroups.find(g => g.id === rg.id);
            return { ...rg, satelliteCount: group?.satellite_ids?.length || 0 };
          })
        : satGroups.slice(0, MAX_RECENT_GROUPS).map(g => ({ id: g.id, name: g.name, type: g.type, satelliteCount: g.satellite_ids?.length || 0 }));

    // Calculate how many pills can fit based on container width
    useEffect(() => {
        if (!containerRef.current || pillGroups.length === 0) return;

        const calculateVisiblePills = () => {
            const container = containerRef.current;
            if (!container) return;

            const containerWidth = container.offsetWidth;
            let accumulatedWidth = 0;
            const gap = 8; // gap between pills in pixels
            const moreButtonWidth = 80; // estimated width of "+X more" button
            let count = 0;

            // Measure each pill until we run out of space
            for (let i = 0; i < pillRefs.current.length; i++) {
                const pill = pillRefs.current[i];
                if (!pill) continue;

                const pillWidth = pill.offsetWidth + gap;

                // Check if adding this pill plus the "more" button would exceed container width
                if (accumulatedWidth + pillWidth + (i < pillGroups.length - 1 ? moreButtonWidth : 0) > containerWidth) {
                    break;
                }

                accumulatedWidth += pillWidth;
                count++;
            }

            // Ensure at least MIN_PILLS_VISIBLE are shown
            setVisibleCount(Math.max(MIN_PILLS_VISIBLE, count));
        };

        // Initial calculation
        calculateVisiblePills();

        // Recalculate on resize
        const resizeObserver = new ResizeObserver(calculateVisiblePills);
        resizeObserver.observe(containerRef.current);

        return () => resizeObserver.disconnect();
    }, [pillGroups]);

    const handleMoreClick = (event) => {
        setAnchorEl(event.currentTarget);
    };

    const handleMenuClose = () => {
        setAnchorEl(null);
    };

    const visiblePills = pillGroups.slice(0, visibleCount);
    const hiddenPills = pillGroups.slice(visibleCount);
    const hasHiddenPills = hiddenPills.length > 0;

    // Count satellites with positive elevation (visible satellites)
    const visibleSatellites = Object.values(selectedSatellitePositions || {}).filter(
        pos => pos.el > 0
    );
    const visibleSatellitesCount = visibleSatellites.length;

    // Count satellites by trend
    const risingCount = visibleSatellites.filter(pos => pos.trend === 'rising').length;
    const fallingCount = visibleSatellites.filter(pos => pos.trend === 'falling').length;
    const peakCount = visibleSatellites.filter(pos => pos.trend === 'peak').length;

    return (
        <Box
            sx={{
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                padding: '12px 12px',
                bgcolor: 'background.paper',
                borderBottom: '1px solid',
                borderColor: 'border.main',
                height: '64px',
                minHeight: '64px',
                maxHeight: '64px',
            }}
        >
            <FormControl
                sx={{ minWidth: 200, maxWidth: 300, flexShrink: 0 }}
                disabled={passesLoading}
                variant="filled"
                size="small"
            >
                <InputLabel htmlFor="grouped-select">{t('satellite_selector.group_label')}</InputLabel>
                <Select
                    disabled={passesLoading}
                    value={satGroups.length ? selectedSatGroupId : ""}
                    id="grouped-select"
                    label="Grouping"
                    variant="filled"
                    size="small"
                    onChange={handleOnGroupChange}
                >
                    <ListSubheader>{t('satellite_selector.user_groups')}</ListSubheader>
                    {satGroups.filter(group => group.type === "user").length === 0 ? (
                        <MenuItem disabled value="">
                            {t('satellite_selector.none_defined')}
                        </MenuItem>
                    ) : (
                        satGroups.map((group, index) => {
                            if (group.type === "user") {
                                return (
                                    <MenuItem
                                        disabled={group.satellite_ids.length > SATELLITE_NUMBER_LIMIT}
                                        value={group.id}
                                        key={index}
                                    >
                                        {group.name} ({group.satellite_ids.length})
                                    </MenuItem>
                                );
                            }
                        })
                    )}
                    <ListSubheader>{t('satellite_selector.tle_groups')}</ListSubheader>
                    {satGroups.filter(group => group.type === "system").length === 0 ? (
                        <MenuItem disabled value="">
                            {t('satellite_selector.none_defined')}
                        </MenuItem>
                    ) : (
                        satGroups.map((group, index) => {
                            if (group.type === "system") {
                                return (
                                    <MenuItem
                                        disabled={group.satellite_ids.length > SATELLITE_NUMBER_LIMIT}
                                        value={group.id}
                                        key={index}
                                    >
                                        {group.name} ({group.satellite_ids.length})
                                    </MenuItem>
                                );
                            }
                        })
                    )}
                </Select>
            </FormControl>

            <Box
                ref={containerRef}
                sx={{
                    // Hide recent-group pills area on mobile
                    display: { xs: 'none', sm: 'flex' },
                    gap: 1,
                    flex: 1,
                    overflow: 'hidden',
                    alignItems: 'center',
                }}
            >
                {/* Hidden pills for measurement */}
                <Box sx={{ position: 'absolute', visibility: 'hidden', display: 'flex', gap: 1, pointerEvents: 'none' }}>
                    {pillGroups.map((group, index) => (
                        <Button
                            key={`measure-${group.id}`}
                            ref={el => pillRefs.current[index] = el}
                            variant="outlined"
                            size="small"
                            sx={{
                                textTransform: 'none',
                                borderRadius: '16px',
                                px: 2,
                            }}
                        >
                            {group.name}
                            <Box component="span" sx={{ ml: 1, opacity: 0.7, fontWeight: 'bold' }}>
                                {group.satelliteCount}
                            </Box>
                        </Button>
                    ))}
                </Box>

                {/* Visible pills */}
                {visiblePills.map((group) => (
                    <Button
                        key={group.id}
                        variant={selectedSatGroupId === group.id ? "contained" : "outlined"}
                        size="small"
                        onClick={() => handleRecentGroupClick(group.id)}
                        sx={{
                            flexShrink: 0,
                            textTransform: 'none',
                            borderRadius: '16px',
                            px: 2,
                        }}
                    >
                        {group.name}
                        <Box
                            component="span"
                            sx={{
                                ml: 1,
                                opacity: 0.7,
                                fontWeight: 'bold',
                            }}
                        >
                            {group.satelliteCount}
                        </Box>
                    </Button>
                ))}

                {/* "More" button */}
                {hasHiddenPills && (
                    <Chip
                        label={`+${hiddenPills.length}`}
                        size="small"
                        clickable
                        onClick={handleMoreClick}
                        sx={{
                            cursor: 'pointer',
                            flexShrink: 0,
                            bgcolor: 'action.selected',
                            '&:hover': {
                                bgcolor: 'action.hover',
                            },
                        }}
                    />
                )}

                {/* Dropdown menu for hidden pills */}
                <Menu
                    anchorEl={anchorEl}
                    open={Boolean(anchorEl)}
                    onClose={handleMenuClose}
                    PaperProps={{
                        sx: {
                            maxHeight: 400,
                            maxWidth: 300,
                        }
                    }}
                >
                    {hiddenPills.map((group) => (
                        <MenuItem
                            key={group.id}
                            onClick={() => handleRecentGroupClick(group.id)}
                            selected={selectedSatGroupId === group.id}
                            sx={{
                                bgcolor: selectedSatGroupId === group.id ? 'primary.main' : 'inherit',
                                '&:hover': {
                                    bgcolor: selectedSatGroupId === group.id ? 'primary.dark' : 'action.hover',
                                },
                            }}
                        >
                            <Typography variant="body2">{group.name}</Typography>
                        </MenuItem>
                    ))}
                </Menu>
            </Box>

            {/* Visible satellites counter */}
            <Tooltip
                title={
                    <Box>
                        <Typography variant="caption" display="block">
                            Rising: {risingCount}
                        </Typography>
                        <Typography variant="caption" display="block">
                            Peak: {peakCount}
                        </Typography>
                        <Typography variant="caption" display="block">
                            Falling: {fallingCount}
                        </Typography>
                    </Box>
                }
                arrow
            >
                <Box
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '6px 12px',
                        bgcolor: 'action.hover',
                        borderRadius: '16px',
                        flexShrink: 0,
                        ml: 'auto',
                        cursor: 'help',
                    }}
                >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <VisibilityIcon sx={{ fontSize: '1.2rem', color: 'success.main' }} />
                        <Typography variant="body2" sx={{ fontWeight: 'bold', color: 'text.primary' }}>
                            {visibleSatellitesCount}
                        </Typography>
                    </Box>

                    {risingCount > 0 && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                            <TrendingUpIcon sx={{ fontSize: '1rem', color: 'info.main' }} />
                            <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'info.main' }}>
                                {risingCount}
                            </Typography>
                        </Box>
                    )}

                    {peakCount > 0 && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                            <HorizontalRuleIcon sx={{ fontSize: '1rem', color: 'warning.main' }} />
                            <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'warning.main' }}>
                                {peakCount}
                            </Typography>
                        </Box>
                    )}

                    {fallingCount > 0 && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                            <TrendingDownIcon sx={{ fontSize: '1rem', color: 'error.main' }} />
                            <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'error.main' }}>
                                {fallingCount}
                            </Typography>
                        </Box>
                    )}
                </Box>
            </Tooltip>
        </Box>
    );
});

export default SatelliteGroupSelectorBar;
