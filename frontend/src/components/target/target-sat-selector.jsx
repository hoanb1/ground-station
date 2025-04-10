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
import {humanizeFrequency, TitleBar} from "../common/common.jsx";
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
} from './target-sat-slice.jsx';
import SatelliteList from "./target-sat-list.jsx";
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

    return (
        <>
            <TitleBar className={"react-grid-draggable window-title-bar"}>Select group and satellite</TitleBar>
            <Grid container spacing={{ xs: 0, md: 0 }} columns={{ xs: 12, sm: 12, md: 12 }}>

                <Grid size={{ xs: 12, sm: 12, md: 12 }} style={{padding: '0rem 0.5rem 0rem 0.5rem'}}>
                    <FormControl disabled={trackingState['rotator_state'] === "tracking"} sx={{ minWidth: 200, marginTop: 1, marginBottom: 1 }} fullWidth variant={"filled"}
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

                <Grid size={{ xs: 12, sm: 12, md: 12 }} style={{padding: '0rem 0.5rem 0rem 0.5rem'}}>
                    <SatelliteList/>
                </Grid>
            </Grid>
        </>
    );
});

export default SatSelectorIsland;