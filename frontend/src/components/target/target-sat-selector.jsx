import { useEffect, useState} from "react";
import {
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
} from './target-sat-slice';
import SatelliteList from "./target-sat-list.jsx";


const SatSelectorIsland = ({ initialNoradId, initialGroupId, handleSelectSatelliteId }) => {
    const dispatch = useDispatch();
    const { socket } = useSocket();
    const { satGroups, groupId, loading, error } = useSelector((state) => state.targetSatTrack);

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
                    groupId: initialGroupId,
                })
            );
            // Optionally set it in Redux right away
            if (initialNoradId) {
                dispatch(setSatelliteId(initialNoradId));
                handleSelectSatelliteId(initialNoradId);
            }
        }
    }, [satGroups, initialGroupId, initialNoradId, dispatch, socket, handleSelectSatelliteId]);

    const handleGroupChange = (e) => {
        const newGroupId = e.target.value;
        dispatch(setSatGroupId(newGroupId));
        dispatch(fetchSatellitesByGroupId({ socket, groupId: newGroupId }));
        dispatch(setSatelliteId(''));
    };

    return (
        <div>
            <TitleBar className={"react-grid-draggable window-title-bar"}>Select group and satellite</TitleBar>
            <Grid container spacing={{ xs: 0, md: 0 }} columns={{ xs: 12, sm: 12, md: 12 }}>
                <Grid size={{ xs: 12, sm: 12, md: 12 }} style={{padding: '0rem 0.5rem'}}>
                    <FormControl disabled={loading} sx={{ minWidth: 200, marginTop: 1, marginBottom: 1 }} fullWidth variant={"filled"}
                                 size={"small"}>
                        <InputLabel htmlFor="grouped-select">Group</InputLabel>
                        <Select disabled={loading}
                                value={groupId}
                                id="grouped-select" label="Grouping" variant={"filled"}
                                size={"small"} onChange={handleGroupChange}>
                            <ListSubheader>User defined satellite groups</ListSubheader>
                            {satGroups.map((group, index) => {
                                if (group.type === "user") {
                                    return <MenuItem value={group.id} key={index}>{group.name}</MenuItem>;
                                }
                            })}
                            <ListSubheader>Build-in satellite groups</ListSubheader>
                            {satGroups.map((group, index) => {
                                if (group.type === "system") {
                                    return <MenuItem value={group.id} key={index}>{group.name}</MenuItem>;
                                }
                            })}
                        </Select>
                    </FormControl>
                </Grid>
                <Grid size={{ xs: 12, sm: 12, md: 12 }} style={{padding: '0rem 0.5rem'}}>
                    <SatelliteList
                        handleSelectSatelliteId={handleSelectSatelliteId}/>
                </Grid>
            </Grid>
        </div>
    );
};

export default SatSelectorIsland;