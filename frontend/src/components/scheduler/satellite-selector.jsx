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

const SatelliteGroupDropdown = ({ onSatelliteSelect, disabled = false }) => {
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
        <FormControl fullWidth variant="outlined" size="small" disabled={disabled || selectedFromSearch}>
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

const SatelliteDropdown = ({ onSatelliteSelect, disabled = false }) => {
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
        <FormControl fullWidth variant="outlined" size="small" disabled={disabled || selectedFromSearch}>
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

const SatelliteSearchAutocomplete = ({ onSatelliteSelect, disabled = false }) => {
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
            // If satellite has groups, populate the dropdowns properly
            if (selectedSatellite.groups && selectedSatellite.groups.length > 0) {
                const firstGroup = selectedSatellite.groups[0];

                // Step 1: Set the group ID first
                dispatch(setGroupId(firstGroup.id));
                dispatch(setSelectedFromSearch(true));

                // Step 2: Fetch satellites for that group
                if (socket) {
                    socket.emit('data_request', 'get-satellites-for-group-id', firstGroup.id, (response) => {
                        if (response.success) {
                            // Step 3: Populate the group satellites
                            dispatch(setGroupOfSats(response.data));

                            // Step 4: Now set the selected satellite ID (after group satellites are loaded)
                            dispatch(setSatelliteId(selectedSatellite.norad_id));

                            // Step 5: Find the satellite from the response (it has group_id)
                            const satelliteWithGroupId = response.data.find(s => s.norad_id === selectedSatellite.norad_id);

                            // Step 6: Call onSatelliteSelect with the satellite that has group_id
                            if (onSatelliteSelect && satelliteWithGroupId) {
                                onSatelliteSelect(satelliteWithGroupId);
                            }
                        }
                    });
                } else {
                    // No socket, call callback anyway
                    if (onSatelliteSelect) {
                        onSatelliteSelect(selectedSatellite);
                    }
                }
            } else {
                // No groups, just set the satellite ID
                dispatch(setSatelliteId(selectedSatellite.norad_id));
                dispatch(setSelectedFromSearch(true));

                if (onSatelliteSelect) {
                    onSatelliteSelect(selectedSatellite);
                }
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
            disabled={disabled}
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

const PassSelector = ({ onPassSelect, initialPass, currentObservationId, disabled = false }) => {
    const dispatch = useDispatch();
    const { socket } = useSocket();
    const { passes, passesLoading, satelliteId, selectedPassId } = useSelector(
        (state) => state.scheduler?.satelliteSelection || {}
    );
    const observations = useSelector((state) => state.scheduler?.observations || []);
    const timezone = useSelector((state) =>
        state.preferences?.preferences?.find(p => p.name === 'timezone')?.value || 'Europe/Athens'
    );
    const [hasSetInitialPass, setHasSetInitialPass] = React.useState(false);

    // Detect if we're waiting for the correct satellite's passes
    const hasWrongSatellitePasses = React.useMemo(() => {
        if (!initialPass || passes.length === 0) return false;

        // Check if any pass matches the initialPass timestamp
        const hasMatch = passes.some(p => {
            const passStartTime = new Date(p.event_start).getTime();
            const initialStartTime = new Date(initialPass.event_start).getTime();
            return Math.abs(passStartTime - initialStartTime) < 1000;
        });

        // If we have passes but no match, we have the wrong satellite's passes
        return !hasMatch;
    }, [passes, initialPass]);

    // Calculate the effective selected pass ID (either from Redux or matched by timestamp)
    const effectiveSelectedPassId = React.useMemo(() => {
        // First try to find by the stored ID
        let found = passes.find(p => p.id === selectedPassId);

        // If not found by ID but we have an initialPass, try matching by timestamp
        if (!found && initialPass && passes.length > 0) {
            found = passes.find(p => {
                const passStartTime = new Date(p.event_start).getTime();
                const initialStartTime = new Date(initialPass.event_start).getTime();
                return Math.abs(passStartTime - initialStartTime) < 1000;
            });
        }

        return found ? found.id : '';
    }, [passes, selectedPassId, initialPass]);

    // Fetch passes when satellite changes
    React.useEffect(() => {
        if (satelliteId && socket) {
            dispatch(fetchNextPassesForScheduler({ socket, noradId: satelliteId, hours: 24, minElevation: 0 }));
            setHasSetInitialPass(false);
        } else {
            // Clear passes if no satellite selected
            dispatch(setSelectedPassId(null));
        }
    }, [satelliteId, socket, dispatch]);

    // Set initial pass after passes are loaded
    React.useEffect(() => {
        if (initialPass && passes.length > 0 && !hasSetInitialPass && satelliteId) {
            // Try to find a matching pass by comparing start times (with tolerance for calculation differences)
            const matchingPass = passes.find(p => {
                const passStartTime = new Date(p.event_start).getTime();
                const initialStartTime = new Date(initialPass.event_start).getTime();
                const timeDiff = Math.abs(passStartTime - initialStartTime);
                // Allow 60 second tolerance for calculation differences
                return timeDiff < 60000;
            });

            if (matchingPass) {
                dispatch(setSelectedPassId(matchingPass.id));
                setHasSetInitialPass(true);
                // Also call the callback
                if (onPassSelect) {
                    onPassSelect(matchingPass);
                }
            }
        }
    }, [initialPass, passes, hasSetInitialPass, satelliteId, dispatch, onPassSelect]);

    const handlePassClick = (pass) => {
        const newPassId = pass ? pass.id : null;
        dispatch(setSelectedPassId(newPassId));
        if (onPassSelect) {
            onPassSelect(pass);
        }
    };

    // Check if a pass overlaps with any existing observation and return conflict info
    const getPassConflict = (pass) => {
        const passStart = new Date(pass.event_start);
        const passEnd = new Date(pass.event_end);

        console.log(`[PassSelector] Checking pass: ${pass.event_start} to ${pass.event_end}`, {
            passStart: passStart.toISOString(),
            passEnd: passEnd.toISOString(),
            totalObservations: observations.length,
            currentObservationId
        });

        const conflictingObs = observations.find(obs => {
            // Skip the observation we're currently editing
            if (currentObservationId && obs.id === currentObservationId) {
                console.log(`[PassSelector] Skipping current observation: ${obs.name}`);
                return false;
            }

            if (!obs.pass) {
                console.log(`[PassSelector] Observation has no pass: ${obs.name}`);
                return false;
            }

            // Use task_start/task_end if available (actual execution window),
            // otherwise fall back to event_start/event_end (full visibility window)
            const obsStart = obs.task_start ? new Date(obs.task_start) : new Date(obs.pass.event_start);
            const obsEnd = obs.task_end ? new Date(obs.task_end) : new Date(obs.pass.event_end);

            // Check for any overlap
            const hasOverlap = (passStart < obsEnd && passEnd > obsStart);

            console.log(`[PassSelector] Checking observation "${obs.name}":`, {
                obsStart: obsStart.toISOString(),
                obsEnd: obsEnd.toISOString(),
                hasOverlap,
                calculation: `${passStart.toISOString()} < ${obsEnd.toISOString()} = ${passStart < obsEnd}`,
                calculation2: `${passEnd.toISOString()} > ${obsStart.toISOString()} = ${passEnd > obsStart}`
            });

            if (hasOverlap) {
                console.log(`[PassSelector] ⚠️ CONFLICT FOUND with observation:`, {
                    name: obs.name,
                    satellite: obs.satellite?.name,
                    obsStart: obsStart.toISOString(),
                    obsEnd: obsEnd.toISOString(),
                    passStart: passStart.toISOString(),
                    passEnd: passEnd.toISOString(),
                });
            }

            return hasOverlap;
        });

        return conflictingObs || null;
    };

    // Check if a pass overlaps with any existing observation
    const isPassOverlapping = (pass) => {
        return getPassConflict(pass) !== null;
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

        // Map timezone to appropriate locale for date formatting
        // This ensures DD/MM/YYYY format for European timezones
        const getLocaleFromTimezone = (tz) => {
            if (tz.startsWith('Europe/') || tz.startsWith('Africa/')) {
                return 'en-GB'; // British English uses DD/MM/YYYY
            } else if (tz.startsWith('America/')) {
                return 'en-US'; // US uses MM/DD/YYYY
            } else if (tz.startsWith('Asia/')) {
                // Most Asian countries use DD/MM/YYYY
                return 'en-GB';
            }
            return 'en-GB'; // Default to European format
        };

        const locale = getLocaleFromTimezone(timezone);

        const formatter = new Intl.DateTimeFormat(locale, {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });
        const dateTimeStr = formatter.format(startDate);

        return {
            primary: `${humanTime} - ${dateTimeStr}`,
            secondary: `Duration: ${duration}min | Max El: ${pass.peak_altitude?.toFixed(1)}°`
        };
    };

    if (!satelliteId) {
        return null; // Don't show pass selector if no satellite selected
    }

    // Show loading only if actually loading or no passes yet, but NOT if we have passes
    // Even if initialPass doesn't match, show the passes we have
    const isLoading = passesLoading || (satelliteId && passes.length === 0 && !passesLoading);

    return (
        <Box>
            {isLoading ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 2 }}>
                    <CircularProgress size={20} />
                    <Typography variant="body2" color="text.secondary">
                        {hasWrongSatellitePasses
                            ? 'Loading passes for selected satellite...'
                            : passesLoading
                                ? 'Loading passes...'
                                : 'Fetching satellite passes...'}
                    </Typography>
                </Box>
            ) : passes.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
                    No passes found in the next 24 hours
                </Typography>
            ) : (
                <Box>
                    <FormControl
                        fullWidth
                        size="small"
                        error={effectiveSelectedPassId && isPassOverlapping(passes.find(p => p.id === effectiveSelectedPassId))}
                        disabled={disabled}
                    >
                        <InputLabel>Select Pass</InputLabel>
                        <Select
                            value={effectiveSelectedPassId || ''}
                            onChange={(e) => {
                                const passId = e.target.value;
                                const selectedPass = passes.find(p => p.id === passId);
                                handlePassClick(selectedPass);
                            }}
                            label="Select Pass"
                        >
                            {/* Future passes */}
                            {passes.map((pass) => {
                                const info = formatPassInfo(pass);
                                const conflictingObs = getPassConflict(pass);
                                const isOverlapping = conflictingObs !== null;
                                return (
                                    <MenuItem
                                        key={pass.id}
                                        value={pass.id}
                                        disabled={isOverlapping}
                                        sx={isOverlapping ? {
                                            opacity: 0.6,
                                            bgcolor: (theme) => theme.palette.mode === 'dark'
                                                ? 'rgba(244, 67, 54, 0.15)'
                                                : 'rgba(244, 67, 54, 0.08)',
                                            borderLeft: (theme) => `3px solid ${theme.palette.error.main}`,
                                        } : {}}
                                    >
                                        <Box sx={{ width: '100%' }}>
                                            <Typography
                                                variant="body2"
                                                sx={isOverlapping ? {
                                                    color: 'text.disabled',
                                                    textDecoration: 'line-through'
                                                } : {}}
                                            >
                                                {info.primary}
                                            </Typography>
                                            <Typography
                                                variant="caption"
                                                sx={{
                                                    display: 'block',
                                                    color: isOverlapping ? 'error.main' : 'text.secondary'
                                                }}
                                            >
                                                {info.secondary}
                                            </Typography>
                                            {isOverlapping && conflictingObs && (
                                                <Typography
                                                    variant="caption"
                                                    sx={{
                                                        display: 'block',
                                                        color: 'error.main',
                                                        fontWeight: 'bold',
                                                        mt: 0.5,
                                                        fontSize: '0.7rem'
                                                    }}
                                                >
                                                    ⚠️ Conflicts with: {conflictingObs.name || conflictingObs.satellite?.name || 'Unknown'}
                                                </Typography>
                                            )}
                                        </Box>
                                    </MenuItem>
                                );
                            })}
                        </Select>
                    </FormControl>
                </Box>
            )}
        </Box>
    );
};

export const SatelliteSelector = ({ onSatelliteSelect, onPassSelect, showPassSelector = true, initialSatellite = null, initialPass = null, currentObservationId = null, disabled = false }) => {
    const dispatch = useDispatch();
    const { socket } = useSocket();
    const satGroups = useSelector((state) => state.scheduler?.satelliteSelection?.satGroups || []);
    const [hasInitialized, setHasInitialized] = React.useState(false);

    // Initialize satellite selector with initialSatellite when provided
    useEffect(() => {
        if (initialSatellite && socket && satGroups.length > 0 && !hasInitialized) {
            const noradId = initialSatellite.norad_id;
            const storedGroupId = initialSatellite.group_id;

            console.log('[SatelliteSelector] Initializing with satellite:', { noradId, storedGroupId, hasTransmitters: !!initialSatellite.transmitters?.length });

            // Immediately set the satellite ID to trigger pass fetching
            dispatch(setSatelliteId(noradId));
            dispatch(setSelectedFromSearch(false));

            // Temporarily add the initialSatellite to groupOfSats so it shows in the dropdown
            dispatch(setGroupOfSats([initialSatellite]));

            setHasInitialized(true);

            // If we have a stored group_id, load that group directly
            if (storedGroupId) {
                console.log('[SatelliteSelector] Fetching satellites for stored group_id:', storedGroupId);
                socket.emit('data_request', 'get-satellites-for-group-id', storedGroupId, (response) => {
                    console.log('[SatelliteSelector] Received response for group_id:', storedGroupId, { success: response.success, dataLength: response.data?.length });
                    if (response.success) {
                        const found = response.data.find(sat => sat.norad_id === noradId || sat.norad_id == noradId || String(sat.norad_id) === String(noradId));
                        if (found) {
                            console.log('[SatelliteSelector] Found satellite in group, transmitters count:', found.transmitters?.length || 0);
                            dispatch(setGroupId(storedGroupId));
                            dispatch(setGroupOfSats(response.data));

                            // Call onSatelliteSelect to update dialog's formData with group_id
                            if (onSatelliteSelect) {
                                onSatelliteSelect(found);
                            }
                        } else {
                            console.log('[SatelliteSelector] Satellite not found in stored group, searching all groups');
                            searchAllGroups();
                        }
                    } else {
                        console.error('[SatelliteSelector] Failed to fetch satellites for group_id:', storedGroupId, response);
                        searchAllGroups();
                    }
                });
            } else {
                // No stored group_id, search through all groups
                console.log('[SatelliteSelector] No stored group_id, searching all groups');
                searchAllGroups();
            }

            function searchAllGroups() {
                let foundGroup = false;
                let checkedGroups = 0;

                console.log('[SatelliteSelector] Searching through', satGroups.length, 'groups for noradId:', noradId);

                satGroups.forEach((group) => {
                    if (foundGroup) return;

                    socket.emit('data_request', 'get-satellites-for-group-id', group.id, (response) => {
                        checkedGroups++;
                        console.log('[SatelliteSelector] Checked group', group.id, `(${checkedGroups}/${satGroups.length})`, { success: response.success, foundInThisGroup: !!response.data?.find(sat => sat.norad_id === noradId) });
                        if (response.success && !foundGroup) {
                            const found = response.data.find(sat => sat.norad_id === noradId);
                            if (found) {
                                foundGroup = true;
                                console.log('[SatelliteSelector] Found satellite in group:', group.id, 'transmitters:', found.transmitters?.length || 0);
                                dispatch(setGroupId(group.id));
                                dispatch(setGroupOfSats(response.data));

                                // Call onSatelliteSelect to update dialog's formData with group_id
                                if (onSatelliteSelect) {
                                    onSatelliteSelect(found);
                                }
                            }
                        }

                        // Log if all groups checked and nothing found
                        if (checkedGroups === satGroups.length && !foundGroup) {
                            console.error('[SatelliteSelector] Satellite not found in any group after checking all', satGroups.length, 'groups');
                        }
                    });
                });
            }
        }
    }, [initialSatellite?.norad_id, socket, satGroups.length, hasInitialized, dispatch]);

    // Reset initialization flag when initialSatellite changes
    useEffect(() => {
        setHasInitialized(false);
    }, [initialSatellite?.norad_id]);

    return (
        <Stack spacing={2}>
            <SatelliteSearchAutocomplete onSatelliteSelect={onSatelliteSelect} disabled={disabled} />
            <Stack direction="row" spacing={2}>
                <SatelliteGroupDropdown onSatelliteSelect={onSatelliteSelect} disabled={disabled} />
                <SatelliteDropdown onSatelliteSelect={onSatelliteSelect} disabled={disabled} />
            </Stack>
            {showPassSelector && <PassSelector onPassSelect={onPassSelect} initialPass={initialPass} currentObservationId={currentObservationId} disabled={disabled} />}
        </Stack>
    );
};
