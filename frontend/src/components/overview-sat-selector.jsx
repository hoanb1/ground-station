import {
    FormControl,
    InputLabel,
    ListSubheader, MenuItem,
    Select,
} from "@mui/material";
import { useTheme, styled } from '@mui/material/styles';
import React, {useEffect, useState} from "react";
import Grid from "@mui/material/Grid2";
import {TitleBar} from "./common.jsx";
import {useSocket} from "./socket.jsx";
import {enqueueSnackbar} from "notistack";
import {useLocalStorageState} from "@toolpad/core";

const OverviewSatelliteGroupSelector = React.memo(function ({handleGroupSatelliteSelection}) {
    const socket = useSocket();
    const [satGroups, setSatGroups] = useState([]);
    const [formGroupSelectError, setFormGroupSelectError] = useState(false);
    const [selectedSatGroupId, setSelectedSatGroupId] = useLocalStorageState('overview-satellite-groupid', "");
    const [selectedSatellites, setSelectedSatellites] = useState([]);

    const ThemedSettingsDiv = styled('div')(({theme}) => ({
        backgroundColor: "#1e1e1e",
        fontsize: '0.9rem !important',
    }));

    useEffect(() => {
        socket.emit("data_request", "get-satellite-groups", null, (response) => {
            if (response['success']) {
                setSatGroups(response.data);
            } else {
                enqueueSnackbar('Failed to get satellite groups', {
                    variant: 'error',
                    autoHideDuration: 5000
                });
                setFormGroupSelectError(true);
            }
        });

        return () => {
            // Cleanup logic goes here (optional)
        };
    }, [selectedSatGroupId]);

    function handleOnGroupChange(event) {
        // let get a list of satellites for the selected group
        const satGroupId = event.target.value;
        socket.emit("data_request", "get-satellites-for-group-id", satGroupId, (response) => {
            if (response['success']) {
                setSelectedSatellites(response.data);
                setSelectedSatGroupId(event.target.value);
                handleGroupSatelliteSelection(response.data);
                setFormGroupSelectError(false);
            } else {
                enqueueSnackbar('Failed to set satellites for group id: ' + selectedSatGroupId + '', {
                    variant: 'error',
                    autoHideDuration: 5000
                });
                setFormGroupSelectError(true);
            }
        });
    }

    return (
        <ThemedSettingsDiv>
            <TitleBar className={"react-grid-draggable window-title-bar"}>Select group of satellites</TitleBar>
            <Grid container spacing={{ xs: 1, md: 1 }} columns={{ xs: 12, sm: 12, md: 12 }}>
                <Grid size={{ xs: 12, sm: 12, md: 12  }} style={{padding: '0rem 1rem 0rem'}}>
                    <FormControl sx={{ minWidth: 200, marginTop: 2, marginBottom: 1 }} fullWidth variant={"filled"} size={"small"}>
                        <InputLabel htmlFor="grouped-select">Group</InputLabel>
                        <Select error={formGroupSelectError} value={selectedSatGroupId} id="grouped-select" label="Grouping"
                                variant={"filled"} size={"small"} onChange={handleOnGroupChange}>
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
            </Grid>
        </ThemedSettingsDiv>
    );
});

export default OverviewSatelliteGroupSelector;
