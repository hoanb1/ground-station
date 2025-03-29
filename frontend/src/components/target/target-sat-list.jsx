import {useEffect, useState} from "react";
import {FormControl, InputLabel, MenuItem, Select} from "@mui/material";
import * as React from "react";
import {useDispatch, useSelector} from "react-redux";
import { setSatelliteId } from './target-sat-slice.jsx';


function SatelliteList({handleSelectSatelliteId}) {
    const dispatch = useDispatch();
    const {satelliteData, groupOfSats, satelliteId} = useSelector((state) => state.targetSatTrack);

    function handleChange(e) {
        dispatch(setSatelliteId(e.target.value));
        handleSelectSatelliteId(e.target.value);
    }

    function isNoradIdInSatellites(noradid) {
        return groupOfSats.some(satellite => satellite["norad_id"] === noradid);
    }

    return (
        <FormControl fullWidth variant={"filled"} size={"small"}>
            <InputLabel htmlFor="satellite-select">Satellite</InputLabel>
            <Select value={satelliteId} id="satellite-select" label="Satellite" variant={"filled"} size={"small"} onChange={handleChange}>
                {groupOfSats.map((satellite, index) => {
                    return <MenuItem value={satellite['norad_id']} key={index}>{satellite['name']}</MenuItem>;
                })}
            </Select>
        </FormControl>
    );
}

export default SatelliteList;