import {useEffect, useState} from "react";
import {FormControl, InputLabel, MenuItem, Select} from "@mui/material";
import * as React from "react";
import {useDispatch, useSelector} from "react-redux";
import { setSatelliteId } from './target-sat-slice.jsx';


function SatelliteList({handleSelectSatelliteId}) {
    const dispatch = useDispatch();
    const {satelliteData, groupOfSats, satelliteId, loading} = useSelector((state) => state.targetSatTrack);

    function handleChange(e) {
        dispatch(setSatelliteId(e.target.value));
        handleSelectSatelliteId(e.target.value);
    }

    return (
        <FormControl fullWidth variant={"filled"} size={"small"}>
            <InputLabel htmlFor="satellite-select">Satellite</InputLabel>
            <Select disabled={loading} value={satelliteId} id="satellite-select" label="Satellite" variant={"filled"} size={"small"} onChange={handleChange}>
                {groupOfSats.map((satellite, index) => {
                    return <MenuItem value={satellite['norad_id']} key={index}>{satellite['name']}</MenuItem>;
                })}
            </Select>
        </FormControl>
    );
}

export default SatelliteList;