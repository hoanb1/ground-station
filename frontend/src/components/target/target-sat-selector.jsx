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
import {TitleBar} from "../common/common.jsx";
import {useLocalStorageState} from "@toolpad/core";
import * as React from "react";
import {useSocket} from "../common/socket.jsx";
import {useDispatch, useSelector} from "react-redux";
import {
    fetchSatelliteGroups,
    fetchSatellitesByGroupId,
    setSatGroupId,
    setSatelliteId,
    setSatelliteSelectOpen,
    setSatelliteGroupSelectOpen,
    setTrackingStateInBackend,
    setGroupOfSats, setLoading,
    setUITrackerDisabled,
    setStarting,
} from './target-sat-slice.jsx';
import SatelliteList from "./target-sat-list.jsx";
import Typography from "@mui/material/Typography";


const SatSelectorIsland = ({ initialNoradId, initialGroupId }) => {
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
    } = useSelector((state) => state.targetSatTrack);

    useEffect(() => {
        // Fetch satellite groups from Redux
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
        //console.info("Group select onOpen");
        dispatch(setSatelliteGroupSelectOpen(true));
    };

    const handleSelectCloseEvent = (event) => {
        //console.info("Group select onClose");
        dispatch(setSatelliteGroupSelectOpen(false));
    };

    const handleTrackingStop = () => {
        const newTrackingState = {...trackingState, state: "idle"};
        dispatch(setTrackingStateInBackend({socket, data: newTrackingState}));
        //dispatch(setUITrackerDisabled(false));
    };

    const handleTrackingStart = () => {
        const newTrackingState = {'norad_id': satelliteId, 'group_id': groupId, state: "tracking"};
        //dispatch(setUITrackerDisabled(true));
        dispatch(setTrackingStateInBackend({socket, data: newTrackingState}));
    };

    return (
        <>
            <TitleBar className={"react-grid-draggable window-title-bar"}>Select group and satellite</TitleBar>
            <Grid container spacing={{ xs: 0, md: 0 }} columns={{ xs: 12, sm: 12, md: 12 }}>
                <Grid size={{ xs: 12, sm: 12, md: 12 }} style={{padding: '0rem 0.5rem'}}>
                    <FormControl disabled={trackingState['state'] === "tracking"} sx={{ minWidth: 200, marginTop: 1, marginBottom: 1 }} fullWidth variant={"filled"}
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
                                    return <MenuItem disabled={group.satellite_ids.length>99} value={group.id} key={index}>{group.name} ({group.satellite_ids.length})</MenuItem>;
                                }
                            })}
                            <ListSubheader>Build-in satellite groups</ListSubheader>
                            {satGroups.map((group, index) => {
                                if (group.type === "system") {
                                    return <MenuItem disabled={group.satellite_ids.length>99} value={group.id} key={index}>{group.name} ({group.satellite_ids.length})</MenuItem>;
                                }
                            })}
                        </Select>
                    </FormControl>
                </Grid>
                <Grid size={{ xs: 12, sm: 12, md: 12 }} style={{padding: '0rem 0.5rem'}}>
                    <SatelliteList/>
                </Grid>
                <Grid size={{ xs: 12, sm: 12, md: 12 }} style={{padding: '0.5rem 0.5rem 0.5rem'}}>
                    <Grid container direction="row" sx={{
                            justifyContent: "space-between",
                            alignItems: "stretch",
                        }}>
                        <Grid size="grow" style={{paddingRight: '0.5rem'}}>
                            <Button fullWidth={true} disabled={trackingState['state'] === "tracking"}
                                    variant="contained" color="success" style={{height: '70px'}}
                                    onClick={()=>{handleTrackingStart()}}
                            >
                                TRACK
                            </Button>
                        </Grid>
                        <Grid size="grow">
                            <Button fullWidth={true} variant="contained" color="error" style={{height: '70px'}}
                                    onClick={() => {handleTrackingStop()}}>
                                STOP
                            </Button>
                        </Grid>
                    </Grid>
                </Grid>
            </Grid>
        </>
    );
};

export default SatSelectorIsland;