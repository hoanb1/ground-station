/**
 * @license
 * Copyright (c) 2024 Efstratios Goudelis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 *
 */


import * as React from "react";
import {useSocket} from "../common/socket.jsx";
import {useDispatch, useSelector} from "react-redux";
import {useEffect} from "react";
import {
    fetchSatelliteGroups,
    fetchSatellitesByGroupId,
    setGroupOfSats,
    setRadioRig,
    setRotator,
    setSatelliteGroupSelectOpen,
    setSatelliteId,
    setSatGroupId,
    setSelectedTransmitter,
    setStarting,
    setTrackingStateInBackend
} from "../target/target-sat-slice.jsx";
import {enqueueSnackbar} from "notistack";
import {
    getClassNamesBasedOnGridEditing,
    humanizeFrequency,
    preciseHumanizeFrequency,
    TitleBar
} from "../common/common.jsx";
import Grid from "@mui/material/Grid2";
import {Button, Divider, FormControl, InputLabel, ListSubheader, MenuItem, Select} from "@mui/material";
import SatelliteList from "../target/target-sat-list.jsx";
import Typography from "@mui/material/Typography";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import {setCenterFrequency} from "./waterfall-slice.jsx";

const RigControl = React.memo(({waterfallSettingsComponentRef}) => {
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
        selectedRadioRig,
        selectedRotator,
        selectedTransmitter,
        availableTransmitters,
        rigData,
    } = useSelector((state) => state.targetSatTrack);

    const {
        selectedSDRId,
        gridEditable,
    } = useSelector((state) => state.waterfall);

    const {
        sdrs
    } = useSelector((state) => state.sdrs);

    const {
        rigs
    } = useSelector((state) => state.rigs);

    // useEffect(() => {
    //     const selectedType = determineRadioType(selectedRadioRig);
    //
    //     if (selectedRadioRig && selectedType==="sdr") {
    //         // Call the function in the waterfall settings component to handle the change
    //         waterfallSettingsComponentRef.current.handleSDRChange({target: {value: selectedRadioRig}});
    //     }
    //
    // }, [selectedRadioRig]);

    const handleTrackingStop = () => {
        const newTrackingState = {...trackingState, 'rig_state': "stopped"};
        dispatch(setTrackingStateInBackend({socket, data: newTrackingState}));
    };

    function getConnectionStatusofRig() {
        if (rigData['connected'] === true) {
            return "Connected";
        } else  if (rigData['connected'] === false) {
            return "Not connected";
        } else {
            return "unknown";
        }
    }

    const handleTrackingStart = () => {
        const newTrackingState = {
            'norad_id': satelliteId,
            'group_id': groupId,
            'rotator_state': trackingState['rotator_state'],
            'rig_state': 'tracking',
            'rig_id': selectedRadioRig,
            'rotator_id': selectedRotator,
            'transmitter_id': selectedTransmitter,
        };

        dispatch(setTrackingStateInBackend({socket, data: newTrackingState}))
            .unwrap()
            .then((response) => {

            })
            .catch((error) => {
                enqueueSnackbar(`Failed to start tracking: ${error.message}`, {
                    variant: "error"
                });
            });
    };

    function determineRadioType(selectedRadioRigOrSDR) {
        let selectedType = "unknown";

        // Check if it's a rig
        const selectedRig = rigs.find(rig => rig.id === selectedRadioRigOrSDR);
        if (selectedRig) {
            selectedType = "rig";
        }

        // Check if it's an SDR
        const selectedSDR = sdrs.find(sdr => sdr.id === selectedRadioRigOrSDR);
        if (selectedSDR) {
            selectedType = "sdr";
        }

        return selectedType;
    }

    function handleRigChange(event) {
        // Find the selected MenuItem to get its type
        const selectedValue = event.target.value;
        const selectedType = determineRadioType(selectedValue);

        // Set the selected radio rig
        dispatch(setRadioRig(selectedValue));

        // // Handle SDR-specific actions
        // if (selectedType === "sdr") {
        //     // Call the function in the waterfall settings component to handle the change
        //     waterfallSettingsComponentRef.current.handleSDRChange(event);
        // } else if (selectedType === "rig") {
        //     // Handle rig-specific actions if needed
        //     // Currently commented out in your code:
        //     // waterfallSettingsComponentRef.current.handleSDRChange(event);
        // }
    }

    function handleTransmitterChange(event) {
        const transmitterId = event.target.value;
        dispatch(setSelectedTransmitter(transmitterId));

        const data = {
            ...trackingState,
            'norad_id': satelliteId,
            'rotator_state': trackingState['rotator_state'],
            'rig_state': trackingState['rig_state'],
            'group_id': groupId,
            'rig_id': selectedRadioRig,
            'rotator_id': selectedRotator,
            'transmitter_id': event.target.value,
        };

        dispatch(setTrackingStateInBackend({ socket: socket, data: data}))
            .unwrap()
            .then((response) => {

            })
            .catch((error) => {

            });

        // // If a transmitter was selected, then set the SDR center frequency
        // if (transmitterId !== "none") {
        //     const selectedTransmitterMetadata = availableTransmitters.find(t => t.id === event.target.value);
        //     const newFrequency = selectedTransmitterMetadata['downlink_low'] || 0;
        //     dispatch(setCenterFrequency(newFrequency));
        //     waterfallSettingsComponentRef.current.sendSDRConfigToBackend({centerFrequency: newFrequency});
        // }
    }

    function connectRig() {
        const data = {
            ...trackingState,
            'rig_state': "connected",
            'rig_id': selectedRadioRig,
        };
        dispatch(setTrackingStateInBackend({ socket, data: data}));
    }

    function disconnectRig() {
        const data = {
            ...trackingState,
            'rig_state': "disconnected",
            'rig_id': selectedRadioRig,
        };
        dispatch(setTrackingStateInBackend({ socket, data: data}));
    }

    return (
        <>
            {/*<TitleBar className={getClassNamesBasedOnGridEditing(gridEditable, ["window-title-bar"])}>Radio rig control</TitleBar>*/}

            <Grid container spacing={{ xs: 0, md: 0 }} columns={{ xs: 12, sm: 12, md: 12 }}>


                <Grid size={{ xs: 12, sm: 12, md: 12 }} style={{padding: '0.5rem 0.5rem 0rem 0.5rem'}}>
                    <FormControl disabled={["tracking", "connected", "stopped"].includes(trackingState['rig_state'])}
                                 sx={{minWidth: 200, marginTop: 0, marginBottom: 1}} fullWidth variant="filled"
                                 size="small">
                        <InputLabel htmlFor="radiorig-select">Radio rig</InputLabel>
                        <Select
                            id="radiorig-select"
                            value={rigs.length > 0? selectedRadioRig: "none"}
                            onChange={(event) => {
                                handleRigChange(event);
                            }}
                            variant={'filled'}>
                            <MenuItem value="none">
                                [no radio rig control]
                            </MenuItem>
                            <MenuItem value="" disabled>
                                <em>select a rig</em>
                            </MenuItem>
                            {rigs.map((rig, index) => {
                                return <MenuItem type={"rig"} value={rig.id} key={index}>{rig.name} ({rig.host}:{rig.port})</MenuItem>;
                            })}
                            <MenuItem value="" disabled>
                                <em>select a SDR</em>
                            </MenuItem>
                            {sdrs.map((sdr, index) => {
                                return <MenuItem type={"sdr"} value={sdr.id} key={index}>{sdr.name}</MenuItem>;
                            })}
                        </Select>
                    </FormControl>
                </Grid>



                <Grid size={{xs: 12, sm: 12, md: 12}} style={{padding: '0rem 0.5rem 0rem 0.5rem'}}>
                    <FormControl disabled={["tracking"].includes(trackingState['rig_state'])}
                                 sx={{minWidth: 200, marginTop: 0, marginBottom: 0}} fullWidth variant="filled"
                                 size="small">
                        <InputLabel htmlFor="transmitter-select">Transmitter</InputLabel>
                        <Select
                            id="transmitter-select"
                            value={availableTransmitters.length > 0 && availableTransmitters.some(t => t.id === selectedTransmitter) ? selectedTransmitter : "none"}
                            onChange={(event) => {
                                handleTransmitterChange(event);
                            }}
                            variant={'filled'}>
                            <MenuItem value="none">
                                [no frequency control]
                            </MenuItem>
                            <MenuItem value="" disabled>
                                <em>select a transmitter</em>
                            </MenuItem>
                            {availableTransmitters.map((transmitter, index) => {
                                return <MenuItem value={transmitter.id} key={transmitter.id}>
                                    {transmitter['description']} ({humanizeFrequency(transmitter['downlink_low'])})
                                </MenuItem>;
                            })}
                        </Select>
                    </FormControl>
                </Grid>

                {/*<Grid container direction="row" sx={{*/}
                {/*    backgroundColor: theme => rigData['connected'] ? theme.palette.success.main : theme.palette.info.main,*/}
                {/*    padding: '0.1rem',*/}
                {/*    justifyContent: "space-between",*/}
                {/*    alignItems: "center",*/}
                {/*    width: '100%',*/}
                {/*}}>*/}
                {/*    <Typography variant="body1" sx={{*/}
                {/*        color: theme => theme.palette.success.contrastText,*/}
                {/*        width: '90%',*/}
                {/*        textAlign: 'center',*/}
                {/*        display: 'inline-flex',*/}
                {/*        alignItems: 'center',*/}
                {/*        justifyContent: 'center',*/}
                {/*    }}>*/}
                {/*        {rigData['connected']*/}
                {/*            ? <CheckCircleOutlineIcon sx={{mr: 1}}/>*/}
                {/*            : <ErrorOutlineIcon sx={{mr: 1}}/>}*/}
                {/*        {getConnectionStatusofRig()}*/}
                {/*    </Typography>*/}
                {/*</Grid>*/}

                <Grid size={{xs: 12, sm: 12, md: 12}} sx={{height: '145px', overflow: 'auto'}}>
                    <Grid size={{xs: 12, sm: 12, md: 12}} style={{padding: '2rem 0.5rem 0rem 0.5rem'}}>
                        <Grid container direction="row" sx={{
                            justifyContent: "space-between",
                            alignItems: "stretch",
                        }}>
                            <Grid size="grow" style={{textAlign: 'center'}}>
                                <Typography variant="body2">
                                    Frequency on Rig
                                </Typography>
                            </Grid>
                            <Grid size="grow" style={{textAlign: 'center'}}>
                                <Typography variant="body2">
                                    Doppler shift
                                </Typography>
                            </Grid>
                        </Grid>
                        <Grid container direction="row" sx={{
                            justifyContent: "space-between",
                            alignItems: "stretch",
                        }}>
                            <Grid size="grow" style={{textAlign: 'center'}}>
                                <Typography variant="h7"
                                            style={{fontFamily: "Monospace, monospace", fontWeight: "bold"}}>
                                    {preciseHumanizeFrequency(rigData['frequency'])}
                                </Typography>
                            </Grid>
                            <Grid size="grow" style={{textAlign: 'center'}}>
                                <Typography variant="h7"
                                            style={{fontFamily: "Monospace, monospace", fontWeight: "bold"}}>
                                    {preciseHumanizeFrequency(rigData['doppler_shift'])}
                                </Typography>
                            </Grid>
                        </Grid>
                    </Grid>
                    <Grid size={{xs: 12, sm: 12, md: 12}} style={{padding: '0.5rem 0.5rem 0rem 0.5rem'}}>
                        <Grid container direction="row" sx={{
                            justifyContent: "space-between",
                            alignItems: "stretch",
                        }}>
                            <Grid size="grow" style={{textAlign: 'center'}}>
                                <Typography variant="body2">
                                    Original frequency
                                </Typography>
                            </Grid>
                            <Grid size="grow" style={{textAlign: 'center'}}>
                                <Typography variant="body2">
                                    Observed frequency
                                </Typography>
                            </Grid>
                        </Grid>
                        <Grid container direction="row" sx={{
                            justifyContent: "space-between",
                            alignItems: "stretch",
                        }}>
                            <Grid size="grow" style={{textAlign: 'center'}}>
                                <Typography variant="h7"
                                            style={{fontFamily: "Monospace, monospace", fontWeight: "bold"}}>
                                    {preciseHumanizeFrequency(rigData['original_freq'])}
                                </Typography>
                            </Grid>
                            <Grid size="grow" style={{textAlign: 'center'}}>
                                <Typography variant="h7"
                                            style={{fontFamily: "Monospace, monospace", fontWeight: "bold"}}>
                                    {preciseHumanizeFrequency(rigData['observed_freq'])}
                                </Typography>
                            </Grid>
                        </Grid>
                    </Grid>
                </Grid>


                <Grid size={{ xs: 12, sm: 12, md: 12 }} style={{padding: '0.5rem 0.5rem 0rem 0.5rem'}}>
                    <Grid container direction="row" sx={{
                        justifyContent: "space-between",
                        alignItems: "stretch",
                    }}>
                        <Grid size="grow" style={{paddingRight: '0.5rem', flex: 1}}>
                            <Button disabled={
                                ["tracking", "connected", "stopped"].includes(trackingState['rig_state']) ||
                                ["none", ""].includes(selectedRotator)
                            } fullWidth={true} variant="contained" color="success" style={{height: '50px'}}
                                    onClick={() => {
                                        connectRig()
                                    }}>
                                CONNECT
                            </Button>
                        </Grid>
                        <Grid size="grow" style={{paddingRight: '0rem', flex: 1}}>
                            <Button disabled={["disconnected"].includes(trackingState['rig_state'])}
                                    fullWidth={true}
                                    variant="contained" color="error" style={{height: '50px'}}
                                    onClick={() => {
                                        disconnectRig()
                                    }}>
                                DISCONNECT
                            </Button>
                        </Grid>
                    </Grid>
                </Grid>

                <Grid size={{ xs: 12, sm: 12, md: 12 }} style={{padding: '0.5rem 0.5rem 0.5rem'}}>
                    <Grid container direction="row" sx={{
                        justifyContent: "space-between",
                        alignItems: "stretch",
                    }}>
                        <Grid size="grow" style={{paddingRight: '0.5rem'}}>
                                <Button fullWidth={true} disabled={
                                    trackingState['rig_state'] === "tracking" || trackingState['rig_state'] === "disconnected" ||
                                    satelliteId === "" ||
                                    ["none", ""].includes(selectedRadioRig)
                                    || ["none", ""].includes(selectedTransmitter)
                                }
                                    variant="contained" color="success" style={{height: '60px'}}
                                    onClick={()=>{handleTrackingStart()}}
                            >
                                TRACK RADIO
                            </Button>
                        </Grid>
                        <Grid size="grow">
                            <Button fullWidth={true} disabled={
                                ["stopped", "disconnected", "connected"].includes(trackingState['rig_state']) ||
                                satelliteId === "" ||
                                ["none", ""].includes(selectedRadioRig)
                                || ["none", ""].includes(selectedTransmitter)
                            } variant="contained" color="error" style={{height: '60px'}}
                                    onClick={() => {handleTrackingStop()}}>
                                STOP
                            </Button>
                        </Grid>
                    </Grid>
                </Grid>
            </Grid>
        </>
    );
});

export default RigControl;