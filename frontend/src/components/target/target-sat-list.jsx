import {useEffect, useState} from "react";
import {FormControl, InputLabel, MenuItem, Select} from "@mui/material";
import * as React from "react";
import {useDispatch, useSelector} from "react-redux";
import {setSatelliteGroupSelectOpen, setSatelliteSelectOpen, setSatelliteId} from './target-sat-slice.jsx';


function SatelliteList() {
    const dispatch = useDispatch();
    const {
        satelliteData,
        groupOfSats,
        satelliteId,
        loading,
        satelliteSelectOpen,
        satelliteGroupSelectOpen,
        trackingState
    } = useSelector((state) => state.targetSatTrack);

    function handleChange(event) {
        const satelliteId = event.target.value;
        dispatch(setSatelliteId(satelliteId));
        //handleSelectSatelliteId(satelliteId);
    }

    const handleSelectOpenEvent = (event) => {
        //console.info("satellite select onOpen");
        dispatch(setSatelliteSelectOpen(true));
    };

    const handleSelectCloseEvent = (event) => {
        //console.info("satellite select onClose");
        dispatch(setSatelliteSelectOpen(false));
    };

    return (
        <FormControl disabled={trackingState['state'] === "tracking"} fullWidth={true} variant={"filled"} size={"small"}>
            <InputLabel htmlFor="satellite-select">Satellite</InputLabel>
            <Select onClose={handleSelectCloseEvent} onOpen={handleSelectOpenEvent}  value={satelliteId}
                    id="satellite-select" label="Satellite" variant={"filled"} size={"small"} onChange={handleChange}>
                {groupOfSats.map((satellite, index) => {
                    return <MenuItem value={satellite['norad_id']} key={index}>{satellite['name']}</MenuItem>;
                })}
            </Select>
        </FormControl>
    );
}

export default SatelliteList;