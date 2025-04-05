import {
    FormControl,
    InputLabel,
    ListSubheader, MenuItem,
    Select,
} from "@mui/material";
import { useTheme, styled } from '@mui/material/styles';
import React, {useEffect, useState} from "react";
import Grid from "@mui/material/Grid2";
import {TitleBar} from "../common/common.jsx";
import {useSocket} from "../common/socket.jsx";
import {enqueueSnackbar} from "notistack";
import {useLocalStorageState} from "@toolpad/core";
import {useDispatch, useSelector} from "react-redux";
import {
    fetchSatelliteGroups,
    setSatGroups,
    setFormGroupSelectError,
    setSelectedSatGroupId,
    setSelectedSatellites,
    fetchSatellitesByGroupId,
} from "./overview-sat-slice.jsx";
import Typography from "@mui/material/Typography";

const SATELLITE_NUMBER_LIMIT = 500;


const OverviewSatelliteGroupSelector = React.memo(function () {
    const { socket } = useSocket();
    const dispatch = useDispatch();
    const { satelliteGroupId, satGroups, formGroupSelectError, selectedSatGroupId } = useSelector(state => state.overviewSatTrack);

    const ThemedSettingsDiv = styled('div')(({theme}) => ({
        backgroundColor: "#1e1e1e",
        fontsize: '0.9rem !important',
    }));

    useEffect(() => {
        dispatch(fetchSatelliteGroups({socket}));

        return () => {

        };
    }, []);

    function handleOnGroupChange(event) {
        // let get a list of satellites for the selected group
        const satGroupId = event.target.value;
        dispatch(setSelectedSatGroupId(satGroupId));
        dispatch(fetchSatellitesByGroupId({socket, satGroupId}));
    }

    return (
        <ThemedSettingsDiv>
            <TitleBar className={"react-grid-draggable window-title-bar"}>Select group of satellites</TitleBar>
            <Grid container spacing={{ xs: 1, md: 1 }} columns={{ xs: 12, sm: 12, md: 12 }}>
                <Grid size={{ xs: 12, sm: 12, md: 12  }} style={{padding: '0.5rem 0.5rem 0rem 0.5rem'}}>
                    <FormControl sx={{ minWidth: 200, marginTop: 1, marginBottom: 1 }} fullWidth variant={"filled"} size={"small"}>
                        <InputLabel htmlFor="grouped-select">Group</InputLabel>
                        <Select error={formGroupSelectError} value={selectedSatGroupId} id="grouped-select" label="Grouping"
                                variant={"filled"} size={"small"} onChange={handleOnGroupChange}>
                            <ListSubheader>User defined satellite groups</ListSubheader>
                            {satGroups.map((group, index) => {
                                if (group.type === "user") {
                                    return <MenuItem disabled={group.satellite_ids.length>SATELLITE_NUMBER_LIMIT} value={group.id} key={index}>{group.name} ({group.satellite_ids.length})</MenuItem>;
                                }
                            })}
                            <ListSubheader>Build-in satellite groups</ListSubheader>
                            {satGroups.map((group, index) => {
                                if (group.type === "system") {
                                    return <MenuItem disabled={group.satellite_ids.length>SATELLITE_NUMBER_LIMIT} value={group.id} key={index}>{group.name} ({group.satellite_ids.length})</MenuItem>;
                                }
                            })}
                        </Select>
                    </FormControl>
                </Grid>
            </Grid>
        </ThemedSettingsDiv>
    );
});

export default OverviewSatelliteGroupSelector;
