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

import React, { useEffect, Fragment } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    ListSubheader,
    TextField,
    CircularProgress,
    Stack,
    Typography,
    List,
    ListItem,
    ListItemButton,
    ListItemText,
    Paper,
    Box,
} from '@mui/material';
import Autocomplete from '@mui/material/Autocomplete';
import { useSocket } from '../common/socket.jsx';
import {
    setSatGroups,
    setGroupId,
    setGroupOfSats,
    setSatelliteId,
    setSearchOptions,
    setSearchLoading,
    setSelectedFromSearch,
    fetchNextPassesForScheduler,
    setSelectedPassId,
} from './scheduler-slice.jsx';

const SATELLITE_NUMBER_LIMIT = 150;

const SatelliteGroupDropdown = ({ onSatelliteSelect }) => {
    const dispatch = useDispatch();
    const { socket } = useSocket();

    const { satGroups, groupId, selectedFromSearch } = useSelector((state) => state.scheduler?.satelliteSelection || {});

    useEffect(() => {
        if (socket) {
            socket.emit('data_request', 'get-satellite-groups', null, (response) => {
                if (response.success) {
                    dispatch(setSatGroups(response.data));
                }
            });
        }
    }, [socket, dispatch]);

    const handleGroupChange = (e) => {
        const newGroupId = e.target.value;
        dispatch(setGroupId(newGroupId));
        dispatch(setSatelliteId(''));
        dispatch(setGroupOfSats([]));
        dispatch(setSelectedFromSearch(false));

        if (socket) {
            socket.emit('data_request', 'get-satellites-for-group-id', newGroupId, (response) => {
                if (response.success) {
                    dispatch(setGroupOfSats(response.data));
                }
            });
        }
    };

    return (
        <FormControl fullWidth variant="outlined" size="small" disabled={selectedFromSearch}>
            <InputLabel>Satellite Group</InputLabel>
            <Select
                value={satGroups.length > 0 ? groupId : ''}
                onChange={handleGroupChange}
                label="Satellite Group"
            >
                <ListSubheader>User Groups</ListSubheader>
                {satGroups.filter(group => group.type === 'user').length === 0 ? (
                    <MenuItem disabled value="">
                        None created
                    </MenuItem>
                ) : (
                    satGroups
                        .filter(group => group.type === 'user')
                        .map((group) => (
                            <MenuItem
                                key={group.id}
                                value={group.id}
                                disabled={group.satellite_ids.length > SATELLITE_NUMBER_LIMIT}
                            >
                                {group.name} ({group.satellite_ids.length})
                            </MenuItem>
                        ))
                )}
                <ListSubheader>TLE Groups</ListSubheader>
                {satGroups
                    .filter(group => group.type === 'system')
                    .map((group) => (
                        <MenuItem
                            key={group.id}
                            value={group.id}
                            disabled={group.satellite_ids.length > SATELLITE_NUMBER_LIMIT}
                        >
                            {group.name} ({group.satellite_ids.length})
                        </MenuItem>
                    ))}
            </Select>
        </FormControl>
    );
};

const SatelliteDropdown = ({ onSatelliteSelect }) => {
    const dispatch = useDispatch();
    const { groupOfSats, satelliteId, selectedFromSearch } = useSelector((state) => state.scheduler?.satelliteSelection || {});

    const handleSatelliteChange = (e) => {
        const noradId = e.target.value;
        dispatch(setSatelliteId(noradId));
        dispatch(setSelectedFromSearch(false));

        const satellite = groupOfSats.find(s => s.norad_id === noradId);
        if (satellite && onSatelliteSelect) {
            onSatelliteSelect(satellite);
        }
    };

    return (
        <FormControl fullWidth variant="outlined" size="small" disabled={selectedFromSearch}>
            <InputLabel>Satellite</InputLabel>
            <Select
                value={groupOfSats.length > 0 && groupOfSats.find(s => s.norad_id === satelliteId) ? satelliteId : ''}
                onChange={handleSatelliteChange}
                label="Satellite"
            >
                {groupOfSats.map((satellite) => (
                    <MenuItem key={satellite.norad_id} value={satellite.norad_id}>
                        #{satellite.norad_id} {satellite.name}
                    </MenuItem>
                ))}
            </Select>
        </FormControl>
    );
};

const SatelliteSearchAutocomplete = ({ onSatelliteSelect }) => {
    const dispatch = useDispatch();
    const { socket } = useSocket();
    const { searchOptions, searchLoading } = useSelector((state) => state.scheduler?.satelliteSelection || {});

    const [open, setOpen] = React.useState(false);

    const handleInputChange = (event, newInputValue) => {
        if (newInputValue.length > 2 && socket) {
            dispatch(setSearchLoading(true));
            socket.emit('data_request', 'get-satellite-search', newInputValue, (response) => {
                if (response.success) {
                    dispatch(setSearchOptions(response.data));
                } else {
                    dispatch(setSearchOptions([]));
                }
                dispatch(setSearchLoading(false));
            });
        }
    };

    const handleOptionSelect = (event, selectedSatellite) => {
        if (selectedSatellite) {
            console.log('Autocomplete selected satellite:', selectedSatellite);

            // If satellite has groups, populate the dropdowns properly
            if (selectedSatellite.groups && selectedSatellite.groups.length > 0) {
                const firstGroup = selectedSatellite.groups[0];

                // Step 1: Set the group ID first
                dispatch(setGroupId(firstGroup.id));

                // Step 2: Fetch satellites for that group
                if (socket) {
                    socket.emit('data_request', 'get-satellites-for-group-id', firstGroup.id, (response) => {
                        if (response.success) {
                            // Step 3: Populate the group satellites
                            dispatch(setGroupOfSats(response.data));

                            // Step 4: Now set the selected satellite ID (after group satellites are loaded)
                            dispatch(setSatelliteId(selectedSatellite.norad_id));
                        }
                    });
                }
            } else {
                // No groups, just set the satellite ID
                dispatch(setSatelliteId(selectedSatellite.norad_id));
            }

            dispatch(setSelectedFromSearch(true));

            if (onSatelliteSelect) {
                onSatelliteSelect(selectedSatellite);
            }
        } else {
            // Clear selection when autocomplete is cleared
            dispatch(setSelectedFromSearch(false));
        }
    };

    const handleClose = () => {
        setOpen(false);
        dispatch(setSearchOptions([]));
    };

    return (
        <Autocomplete
            size="small"
            fullWidth
            open={open}
            onOpen={() => setOpen(true)}
            onClose={handleClose}
            onInputChange={handleInputChange}
            onChange={handleOptionSelect}
            isOptionEqualToValue={(option, value) => option.norad_id === value.norad_id}
            getOptionLabel={(option) => `${option.norad_id} - ${option.name}`}
            options={searchOptions}
            loading={searchLoading}
            renderInput={(params) => (
                <TextField
                    {...params}
                    label="Search Satellite"
                    variant="outlined"
                    size="small"
                    slotProps={{
                        input: {
                            ...params.InputProps,
                            endAdornment: (
                                <Fragment>
                                    {searchLoading ? <CircularProgress color="inherit" size={20} /> : null}
                                    {params.InputProps.endAdornment}
                                </Fragment>
                            ),
                        },
                    }}
                />
            )}
        />
    );
};

const PassSelector = ({ onPassSelect }) => {
    const dispatch = useDispatch();
    const { socket } = useSocket();
    const { passes, passesLoading, satelliteId, selectedPassId } = useSelector(
        (state) => state.scheduler?.satelliteSelection || {}
    );
    const observations = useSelector((state) => state.scheduler?.observations || []);

    // Fetch passes when satellite changes
    React.useEffect(() => {
        if (satelliteId && socket) {
            dispatch(fetchNextPassesForScheduler({ socket, noradId: satelliteId, hours: 72 }));
        } else {
            // Clear passes if no satellite selected
            dispatch(setSelectedPassId(null));
        }
    }, [satelliteId, socket, dispatch]);

    const handlePassClick = (pass) => {
        const newPassId = pass ? pass.id : null;
        dispatch(setSelectedPassId(newPassId));
        if (onPassSelect) {
            onPassSelect(pass);
        }
    };

    // Check if a pass overlaps with any existing observation
    const isPassOverlapping = (pass) => {
        const passStart = new Date(pass.event_start);
        const passEnd = new Date(pass.event_end);

        return observations.some(obs => {
            if (!obs.pass) return false;
            const obsStart = new Date(obs.pass.event_start);
            const obsEnd = new Date(obs.pass.event_end);

            // Check for any overlap
            return (passStart < obsEnd && passEnd > obsStart);
        });
    };

    const humanizeTime = (isoString) => {
        const now = new Date();
        const target = new Date(isoString);
        const diffMs = target - now;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffMins < 0) {
            return 'passed';
        } else if (diffMins < 60) {
            return `in ${diffMins}min`;
        } else if (diffHours < 24) {
            const remainingMins = diffMins % 60;
            return `in ${diffHours}h ${remainingMins}min`;
        } else {
            const remainingHours = diffHours % 24;
            return `in ${diffDays}d ${remainingHours}h`;
        }
    };

    const formatPassInfo = (pass) => {
        const startDate = new Date(pass.event_start);
        const endDate = new Date(pass.event_end);
        const duration = Math.round((endDate - startDate) / 1000 / 60); // minutes
        const humanTime = humanizeTime(pass.event_start);

        return {
            primary: `${humanTime} - ${startDate.toLocaleString()}`,
            secondary: `Duration: ${duration}min | Max El: ${pass.peak_altitude?.toFixed(1)}°`
        };
    };

    if (!satelliteId) {
        return null; // Don't show pass selector if no satellite selected
    }

    return (
        <Box>
            {passesLoading ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 2 }}>
                    <CircularProgress size={20} />
                    <Typography variant="body2" color="text.secondary">
                        Loading passes...
                    </Typography>
                </Box>
            ) : passes.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
                    No passes found in the next 72 hours
                </Typography>
            ) : (
                <FormControl fullWidth size="small">
                    <InputLabel>Select Pass</InputLabel>
                    <Select
                        value={selectedPassId || ''}
                        onChange={(e) => {
                            const passId = e.target.value;
                            const selectedPass = passes.find(p => p.id === passId);
                            handlePassClick(selectedPass);
                        }}
                        label="Select Pass"
                    >
                        {passes.map((pass) => {
                            const info = formatPassInfo(pass);
                            const isOverlapping = isPassOverlapping(pass);
                            return (
                                <MenuItem
                                    key={pass.id}
                                    value={pass.id}
                                    disabled={isOverlapping}
                                >
                                    <Box>
                                        <Typography variant="body2">
                                            {info.primary}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary">
                                            {info.secondary}
                                            {isOverlapping && ' • ⚠ Conflicts with existing observation'}
                                        </Typography>
                                    </Box>
                                </MenuItem>
                            );
                        })}
                    </Select>
                </FormControl>
            )}
        </Box>
    );
};

export const SatelliteSelector = ({ onSatelliteSelect, onPassSelect, showPassSelector = true, initialSatellite = null }) => {
    const dispatch = useDispatch();
    const { socket } = useSocket();
    const satGroups = useSelector((state) => state.scheduler?.satelliteSelection?.satGroups || []);
    const [hasInitialized, setHasInitialized] = React.useState(false);
    
    // Initialize satellite selector with initialSatellite when provided
    useEffect(() => {
        if (initialSatellite && socket && satGroups.length > 0 && !hasInitialized) {
            const noradId = initialSatellite.norad_id;
            let foundGroup = false;
            
            // Search through groups to find one containing this satellite
            satGroups.forEach((group) => {
                if (foundGroup) return; // Skip if already found
                
                socket.emit('data_request', 'get-satellites-for-group-id', group.id, (response) => {
                    if (response.success && !foundGroup) {
                        const found = response.data.find(sat => sat.norad_id === noradId);
                        if (found) {
                            foundGroup = true;
                            dispatch(setGroupId(group.id));
                            dispatch(setGroupOfSats(response.data));
                            // Delay setting satellite ID to ensure groupOfSats is populated
                            setTimeout(() => {
                                dispatch(setSatelliteId(noradId));
                                dispatch(setSelectedFromSearch(false));
                                setHasInitialized(true);
                            }, 100);
                        }
                    }
                });
            });
        }
    }, [initialSatellite?.norad_id, socket, satGroups.length, hasInitialized, dispatch]);
    
    // Reset initialization flag when initialSatellite changes
    useEffect(() => {
        setHasInitialized(false);
    }, [initialSatellite?.norad_id]);
    
    return (
        <Stack spacing={2}>
            <SatelliteSearchAutocomplete onSatelliteSelect={onSatelliteSelect} />
            <Stack direction="row" spacing={2}>
                <SatelliteGroupDropdown onSatelliteSelect={onSatelliteSelect} />
                <SatelliteDropdown onSatelliteSelect={onSatelliteSelect} />
            </Stack>
            {showPassSelector && <PassSelector onPassSelect={onPassSelect} />}
        </Stack>
    );
};
