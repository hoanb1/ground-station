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
    const [groupOfSats, setGroupOfSats] = useState([]);
    const [formGroupSelectError, setFormGroupSelectError] = useState(false);

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
                    initialNoradId,
                })
            );
            // Optionally set it in Redux right away
            if (initialNoradId) {
                dispatch(setSatelliteId(initialNoradId));
                handleSelectSatelliteId(initialNoradId);
            }
        }
    }, [satGroups, initialGroupId, initialNoradId, dispatch, socket, handleSelectSatelliteId]);

    //
    //
    // const  fetchSatellitesByGroupId = function(satGroupId) {
    //     // call the backend to get the satellites for that group
    //     socket.emit("data_request", "get-satellites-for-group-id", satGroupId, (response) => {
    //         if (response['success']) {
    //             let satGroup = response.data;
    //             satGroup.sort((a, b) => a.name.localeCompare(b.name));
    //             setGroupOfSats(satGroup);
    //
    //             // check if the initial norad id value is in the set of returned satellites
    //             if (initialNoradId) {
    //                 const selectedSatellite = response.data.find((satellite) => satellite['norad_id'] === initialNoradId);
    //                 if (selectedSatellite) {
    //                     handleSelectSatelliteId(initialNoradId);
    //                 }
    //             }
    //         } else {
    //             setFormGroupSelectError(true);
    //             enqueueSnackbar('Failed to set satellites for group id: ' + satGroupId + '', {
    //                 variant: 'error',
    //                 autoHideDuration: 5000,
    //             });
    //         }
    //     });
    // }


    const handleGroupChange = (e) => {
        const newGroupId = e.target.value;
        dispatch(setSatGroupId(newGroupId));
        dispatch(fetchSatellitesByGroupId({ socket, groupId: newGroupId }));
        dispatch(setSatelliteId(''));
        //handleSelectSatelliteId('');
    };

    //
    //
    // const handleOnGroupChange = function (event) {
    //     // set the group id
    //     const satGroupId = event.target.value;
    //     setSelectedSatGroupId(satGroupId);
    //
    //     // fetch satellite groups
    //     fetchSatellitesByGroupId(satGroupId);
    // };

    return (
        <div>
            <TitleBar className={"react-grid-draggable window-title-bar"}>Select group and satellite</TitleBar>
            <Grid container spacing={{ xs: 0, md: 0 }} columns={{ xs: 12, sm: 12, md: 12 }}>
                <Grid size={{ xs: 12, sm: 12, md: 12 }} style={{padding: '0rem 0.5rem'}}>
                    <FormControl sx={{ minWidth: 200, marginTop: 1, marginBottom: 1 }} fullWidth variant={"filled"}
                                 size={"small"}>
                        <InputLabel htmlFor="grouped-select">Group</InputLabel>
                        <Select disabled={loading} error={formGroupSelectError}
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