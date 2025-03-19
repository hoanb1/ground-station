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


function SatelliteList({initialNoradId, groupOfSats, handleSelectSatelliteId}) {
    const [selectedSatelliteId, setSelectedSatelliteId] = useState("");

    function handleChange(e) {
        setSelectedSatelliteId(e.target.value);
        handleSelectSatelliteId(e.target.value);
    }

    function isNoradIdInSatellites(noradid) {
        return groupOfSats.some(satellite => satellite["norad_id"] === noradid);
    }
    
    useEffect(() => {
        if (isNoradIdInSatellites(initialNoradId)) {
            setSelectedSatelliteId(initialNoradId);
        } else if(!isNoradIdInSatellites(selectedSatelliteId)) {
            setSelectedSatelliteId("");
        }

        return () => {

        };
    }, [groupOfSats]);

    return (
        <FormControl fullWidth variant={"filled"} size={"small"}>
            <InputLabel htmlFor="satellite-select">Satellite</InputLabel>
            <Select value={groupOfSats.length? initialNoradId: ""} id="satellite-select" label="Satellite" variant={"filled"} size={"small"} onChange={handleChange}>
                {groupOfSats.map((satellite, index) => {
                    return <MenuItem value={satellite['norad_id']} key={index}>{satellite['name']}</MenuItem>;
                })}
            </Select>
        </FormControl>
    );
}

const SatSelectorIsland = ({ initialNoradId, initialGroupId, handleSelectSatelliteId }) => {
    const socket = useSocket();
    const [satGroups, setSatGroups] = useState([]);
    const [selectedSatGroupId, setSelectedSatGroupId] = useLocalStorageState('target-satellite-groupid', "");
    const [groupOfSats, setGroupOfSats] = useState([]);
    const [formGroupSelectError, setFormGroupSelectError] = useState(false);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetchSatelliteGroups();


        return () => {

        };
    }, []);

    useEffect(() => {
        if (satGroups.some(group => group.id === initialGroupId)) {
            console.log("initialGroupId: " + initialGroupId);
            setSelectedSatGroupId(initialGroupId);
            fetchSatellitesByGroupId(initialGroupId);
        }

        return () => {

        };
    }, [satGroups]);

    const fetchSatelliteGroups = function() {
        setLoading(true);
        socket.emit("data_request", "get-satellite-groups", null, (response) => {
            if (response['success']) {
                setSatGroups(response.data);
            } else {
                setFormGroupSelectError(true);
                enqueueSnackbar('Failed to set satellites groups:' + response.message, {
                    variant: 'error',
                    autoHideDuration: 5000,
                });
            }
        });
        setLoading(false);
    }

    const  fetchSatellitesByGroupId = function(satGroupId) {
        // call the backend to get the satellites for that group
        socket.emit("data_request", "get-satellites-for-group-id", satGroupId, (response) => {
            if (response['success']) {
                setGroupOfSats(response.data);

                // check if the initial norad id value is in the set of returned satellites
                if (initialNoradId) {
                    console.log("initialNoradId: " + initialNoradId);
                    const selectedSatellite = response.data.find((satellite) => satellite['norad_id'] === initialNoradId);
                    if (selectedSatellite) {
                        console.log("selectedSatellite: " + selectedSatellite);
                        handleSelectSatelliteId(initialNoradId);
                    }
                }
                
            } else {
                setFormGroupSelectError(true);
                enqueueSnackbar('Failed to set satellites for group id: ' + satGroupId + '', {
                    variant: 'error',
                    autoHideDuration: 5000,
                });
            }
        });
    }

    const handleOnGroupChange = function (event) {
        // set the group id
        const satGroupId = event.target.value;
        setSelectedSatGroupId(satGroupId);

        // fetch satellite groups
        fetchSatellitesByGroupId(satGroupId);
    };

    return (
        <div>
            <TitleBar className={"react-grid-draggable window-title-bar"}>Select group and satellite</TitleBar>
            <Grid container spacing={{ xs: 0, md: 0 }} columns={{ xs: 12, sm: 12, md: 12 }}>
                <Grid size={{ xs: 12, sm: 12, md: 12 }} style={{padding: '0rem 0.5rem'}}>
                    <FormControl sx={{ minWidth: 200, marginTop: 1, marginBottom: 1 }} fullWidth variant={"filled"} size={"small"}>
                        <InputLabel htmlFor="grouped-select">Group</InputLabel>
                        <Select disabled={loading} error={formGroupSelectError} value={satGroups.length? selectedSatGroupId: ""} id="grouped-select" label="Grouping" variant={"filled"} size={"small"} onChange={handleOnGroupChange}>
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
                    <SatelliteList initialNoradId={initialNoradId} groupOfSats={groupOfSats} handleSelectSatelliteId={handleSelectSatelliteId}/>
                </Grid>
            </Grid>
        </div>
    );
};

export default SatSelectorIsland;