import { useEffect, useState} from "react";
import {
    FormControl,
    InputLabel,
    ListSubheader,
    MenuItem,
    Select,
} from "@mui/material";
import Grid from '@mui/material/Grid2';
import {TitleBar} from "./common.jsx";
import {useLocalStorageState} from "@toolpad/core";
import * as React from "react";
import {useSocket} from "./socket.jsx";
import {enqueueSnackbar} from "notistack";


function SatelliteList({satellitesInGroup, handleSelectSatelliteId}) {
    const [selectedSatelliteId, setSelectedSatelliteId] = useState("");

    function handleChange(e) {
        setSelectedSatelliteId(e.target.value);
        handleSelectSatelliteId(e.target.value);
    }

    useEffect(() => {
        if (!satellitesInGroup.some((group) => group["norad_id"] === selectedSatelliteId)) {
            setSelectedSatelliteId("");
        }

        return () => {

        };
    }, [satellitesInGroup]);

    return (
        <FormControl fullWidth variant={"filled"} size={"small"}>
            <InputLabel htmlFor="satellite-select">Satellite</InputLabel>
            <Select value={selectedSatelliteId} id="satellite-select" label="Satellite" variant={"filled"} size={"small"} onChange={handleChange}>
                {satellitesInGroup.map((satellite, index) => {
                    return <MenuItem value={satellite['norad_id']} key={index}>{satellite['name']}</MenuItem>;
                })}
            </Select>
        </FormControl>
    );
}

const SatSelectorIsland = ({ handleSelectSatelliteId }) => {
    const socket = useSocket();
    const [satGroups, setSatGroups] = useState([]);
    const [selectedSatGroupId, setSelectedSatGroupId] = useLocalStorageState('target-satellite-groupid', 'noaa');
    const [satellitesInGroup, setSatellitesInGroup] = useState([]);
    const [formGroupSelectError, setFormGroupSelectError] = useState(false);

    useEffect(() => {
        socket.emit("data_request", "get-satellite-groups", null, (response) => {
            if (response['success']) {
                setSatGroups(response.data);
            } else {

            }
        });

        return () => {

        };
    }, [selectedSatGroupId]);

    const handleOnGroupChange = function (event) {
        // set the group id
        const satGroupId = event.target.value;
        setSelectedSatGroupId(satGroupId);

        // call the backend to get the satellites for that group
        socket.emit("data_request", "get-satellites-for-group-id", satGroupId, (response) => {
            if (response['success']) {
                setSatellitesInGroup(response.data);
            } else {
                setFormGroupSelectError(true);
                enqueueSnackbar('Failed to set satellites for group id: ' + satGroupId + '', {
                        variant: 'error',
                        autoHideDuration: 5000,
                });
            }
        });
    };

    return (
        <div>
            <TitleBar className={"react-grid-draggable window-title-bar"}>Select group and satellite</TitleBar>
            <Grid container spacing={{ xs: 1, md: 1 }} columns={{ xs: 12, sm: 12, md: 12 }}>
                <Grid size={{ xs: 12, sm: 12, md: 12 }} style={{padding: '0rem 1rem'}}>
                    <FormControl sx={{ minWidth: 200, marginTop: 2, marginBottom: 1 }} fullWidth variant={"filled"} size={"small"}>
                        <InputLabel htmlFor="grouped-select">Group</InputLabel>
                        <Select error={formGroupSelectError} defaultValue="" id="grouped-select" label="Grouping" variant={"filled"} size={"small"} onChange={handleOnGroupChange}>
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
                <Grid size={{ xs: 12, sm: 12, md: 12 }} style={{padding: '0rem 1rem 0rem'}}>
                    <SatelliteList satellitesInGroup={satellitesInGroup} handleSelectSatelliteId={handleSelectSatelliteId}/>
                </Grid>
            </Grid>
        </div>
    );
};

export default SatSelectorIsland;