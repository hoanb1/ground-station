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


import { useEffect, useState} from "react";
import {
    Button,
    FormControl,
    InputLabel,
    ListSubheader,
    MenuItem,
    Select,
} from "@mui/material";
import Grid from '@mui/material/Grid2';
import {getClassNamesBasedOnGridEditing, humanizeFrequency, TitleBar} from "../common/common.jsx";
import * as React from "react";
import {useSocket} from "../common/socket.jsx";
import {useDispatch, useSelector} from "react-redux";
import {
    fetchSatelliteGroups,
    fetchSatellitesByGroupId,
    setSatGroupId,
    setSatelliteId,
    setSatelliteGroupSelectOpen,
    setTrackingStateInBackend,
    setGroupOfSats, setLoading,
    setStarting,
    setRadioRig,
    setRotator, setSelectedTransmitter,
} from './target-slice.jsx';
import SatelliteList from "./satellite-dropdown.jsx";
import {enqueueSnackbar} from "notistack";


const SATELLITE_NUMBER_LIMIT = 500;

const SatSelectorIsland = React.memo(({initialNoradId, initialGroupId}) => {
    const { socket } = useSocket();
    const dispatch = useDispatch();
    const {
        satGroups,
        groupId,
        loading,
        error,
        satelliteSelectOpen,
        satelliteGroupSelectOpen,
        groupOfSats,
        trackingState,
        satelliteId,
        uiTrackerDisabled,
        starting,
        selectedRadioRig,
        selectedRotator,
        selectedTransmitter,
        availableTransmitters,
        gridEditable,
        rigData,
        rotatorData,
    } = useSelector((state) => state.targetSatTrack);

    const { rigs } = useSelector((state) => state.rigs);
    const { rotators } = useSelector((state) => state.rotators);

    useEffect(() => {
        dispatch(fetchSatelliteGroups({ socket }));
    }, [dispatch, socket]);

    useEffect(() => {
        if (satGroups.some(group => group.id === initialGroupId)) {
            fetchSatellitesByGroupId(initialGroupId);
        }

        return () => {

        };
    }, [satGroups]);

    useEffect(() => {
        // If the known group list includes initialGroupId, set it and fetch group satellites
        if (satGroups.some((group) => group.id === initialGroupId)) {
            dispatch(setSatGroupId(initialGroupId));
            dispatch(
                fetchSatellitesByGroupId({
                    socket,
                    groupId: groupId,
                })
            );
            // Optionally set it in Redux right away
            if (initialNoradId) {
                dispatch(setSatelliteId(initialNoradId));
            }
        }
    }, [satGroups, initialGroupId, initialNoradId, dispatch, socket]);

    useEffect(() => {
        dispatch(setStarting(false));
        return () => {

        };
    }, []);

    const handleGroupChange = (e) => {
        const newGroupId = e.target.value;
        dispatch(setSatGroupId(newGroupId));
        dispatch(fetchSatellitesByGroupId({ socket, groupId: newGroupId }));
        dispatch(setSatelliteId(''));
        dispatch(setGroupOfSats([]));
    };

    const handleSelectOpenEvent = (event) => {
        dispatch(setSatelliteGroupSelectOpen(true));
    };

    const handleSelectCloseEvent = (event) => {
        dispatch(setSatelliteGroupSelectOpen(false));
    };

    const handleTrackingStop = () => {
        const newTrackingState = {
            ...trackingState,
            'rotator_state': "stopped",
            'rig_state': "stopped",
        };
        dispatch(setTrackingStateInBackend({socket, data: newTrackingState}));
    };

    return (
        <>
            <TitleBar className={getClassNamesBasedOnGridEditing(gridEditable, ["window-title-bar"])}>Select group and satellite</TitleBar>
            <Grid container spacing={{ xs: 0, md: 0 }} columns={{ xs: 12, sm: 12, md: 12 }}>
                <Grid size={{ xs: 8, sm: 8, md: 8 }}>
                    <Grid size={{ xs: 12, sm: 12, md: 12 }} style={{padding: '0rem 0rem 0.0rem 0.5rem'}}>
                        <FormControl disabled={trackingState['rotator_state'] === "tracking" || trackingState['rig_state'] === "tracking"} sx={{ minWidth: 200, marginTop: 1, marginBottom: 1 }} fullWidth variant={"filled"}
                                     size={"small"}>
                            <InputLabel htmlFor="grouped-select">Group</InputLabel>
                            <Select onClose={handleSelectCloseEvent}
                                    onOpen={handleSelectOpenEvent}
                                    onChange={handleGroupChange}
                                    value={satGroups.length > 0? groupId: ""}
                                    id="grouped-select" label="Grouping" variant={"filled"}
                                    size={"small"}>
                                <ListSubheader>User defined satellite groups</ListSubheader>
                                {satGroups.map((group, index) => {
                                    if (group.type === "user") {
                                        return <MenuItem disabled={group.satellite_ids.length>SATELLITE_NUMBER_LIMIT} value={group.id} key={index}>{group.name} ({group.satellite_ids.length})</MenuItem>;
                                    }
                                })}
                                <ListSubheader>TLE source groups</ListSubheader>
                                {satGroups.map((group, index) => {
                                    if (group.type === "system") {
                                        return <MenuItem disabled={group.satellite_ids.length>SATELLITE_NUMBER_LIMIT} value={group.id} key={index}>{group.name} ({group.satellite_ids.length})</MenuItem>;
                                    }
                                })}
                            </Select>
                        </FormControl>
                    </Grid>
                    <Grid
                        size={{ xs: 12, sm: 12, md: 12 }}
                        style={{ padding: '0rem 0rem 0.5rem 0.5rem' }}
                    >
                        <SatelliteList/>
                    </Grid>
                </Grid>
                <Grid
                    size={{ xs: 4, sm: 4, md: 4 }}
                    style={{
                        padding: '0.5rem 0.5rem 0.5rem 0.5rem',
                        display: 'flex',
                        alignItems: 'center',
                }}
                >
                    <Button
                        variant="contained"
                        color="error"
                        disabled={rigData['tracking'] !== true && rotatorData['tracking'] !== true}
                        size="large"
                        onClick={handleTrackingStop}
                        sx={{
                            width: '100%',
                            height: '100%',
                            fontSize: '1rem',
                            marginTop: 1,
                            marginBottom: 1,
                        }}
                    >
                        STOP TRACKING
                    </Button>
                </Grid>
            </Grid>
        </>
    );
});

export default SatSelectorIsland;