import * as React from "react";
import {useSocket} from "../common/socket.jsx";
import {useDispatch, useSelector} from "react-redux";
import {useEffect} from "react";
import {
    fetchSatelliteGroups,
    fetchSatellitesByGroupId, setGroupOfSats, setRadioRig, setRotator, setSatelliteGroupSelectOpen,
    setSatelliteId,
    setSatGroupId, setSelectedTransmitter,
    setStarting, setTrackingStateInBackend
} from "./target-sat-slice.jsx";
import {enqueueSnackbar} from "notistack";
import {humanizeFrequency, TitleBar} from "../common/common.jsx";
import Grid from "@mui/material/Grid2";
import {Button, Divider, FormControl, InputLabel, ListSubheader, MenuItem, Select} from "@mui/material";
import SatelliteList from "./target-sat-list.jsx";
import Typography from "@mui/material/Typography";

const RigControl = React.memo(({initialNoradId, initialGroupId}) => {
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
    } = useSelector((state) => state.targetSatTrack);

    const { rigs } = useSelector((state) => state.rigs);
    const { rotators } = useSelector((state) => state.rotators);


    const handleTrackingStop = () => {
        const newTrackingState = {...trackingState, 'rig_state': "idle"};
        dispatch(setTrackingStateInBackend({socket, data: newTrackingState}));
    };

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

    function handleRigChange(event) {
        dispatch(setRadioRig(event.target.value));
    }

    return (
        <>
            <TitleBar className={"react-grid-draggable window-title-bar"}>Radio rig control</TitleBar>
            <Grid container spacing={{ xs: 0, md: 0 }} columns={{ xs: 12, sm: 12, md: 12 }}>


                <Grid size={{ xs: 12, sm: 12, md: 12 }} style={{padding: '0.5rem 0.5rem 0rem 0.5rem'}}>
                    <FormControl disabled={trackingState['rig_state'] === "tracking"} sx={{minWidth: 200, marginTop: 0, marginBottom: 1}} fullWidth variant="filled"
                                 size="small">
                        <InputLabel htmlFor="radiorig-select">Radio rig</InputLabel>
                        <Select
                            id="radiorig-select"
                            value={rigs.length > 0? selectedRadioRig: "none"} // Set the current value here
                            onChange={(event) => {
                                handleRigChange(event);
                            }}
                            variant={'filled'}>
                            <MenuItem value="none">
                                [no radio rig control]
                            </MenuItem>
                            <MenuItem value="" disabled>
                                <em>select a radio</em>
                            </MenuItem>
                            {rigs.map((rig, index) => {
                                return <MenuItem value={rig.id} key={index}>{rig.name} ({rig.host}:{rig.port})</MenuItem>;
                            })}
                        </Select>
                    </FormControl>
                </Grid>

                <Grid size={{ xs: 12, sm: 12, md: 12 }} style={{padding: '0rem 0.5rem 0rem 0.5rem'}}>
                    <Grid container direction="row" sx={{
                        justifyContent: "space-between",
                        alignItems: "stretch",
                    }}>
                        <Grid size="grow" style={{textAlign: 'center'}}>
                            <Typography variant="body1">
                                Frequency
                            </Typography>
                        </Grid>
                        <Grid size="grow" style={{textAlign: 'center'}}>
                            <Typography variant="body1" >
                                Doppler shift
                            </Typography>
                        </Grid>
                    </Grid>
                    <Grid container direction="row" sx={{
                        justifyContent: "space-between",
                        alignItems: "stretch",
                    }}>
                        <Grid size="grow" style={{textAlign: 'center'}}>
                            <Typography variant="body2" style={{fontFamily: "Monospace, monospace", fontWeight: "bold"}}>
                                437Mhz
                            </Typography>
                        </Grid>
                        <Grid size="grow" style={{textAlign: 'center'}}>
                            <Typography variant="body2" style={{fontFamily: "Monospace, monospace", fontWeight: "bold"}}>
                                +455656 hz
                            </Typography>
                        </Grid>
                    </Grid>
                </Grid>

                <Grid size={{ xs: 12, sm: 12, md: 12 }} style={{padding: '0.5rem 0.5rem 0rem 0.5rem'}}>
                    <Grid container direction="row" sx={{
                        justifyContent: "space-between",
                        alignItems: "stretch",
                    }}>
                        <Grid size="grow" style={{paddingRight: '0.5rem'}}>
                            <Button disabled={true} fullWidth={true} variant="contained" color="secondary" style={{height: '35px'}}>
                                A
                            </Button>
                        </Grid>
                        <Grid size="grow" style={{paddingRight: '0.5rem'}}>
                            <Button disabled={true} fullWidth={true} variant="contained" color="info" style={{height: '35px'}}>
                                B
                            </Button>
                        </Grid>
                        <Grid size="grow" style={{paddingRight: '0rem'}}>
                            <Button disabled={true} fullWidth={true} variant="contained" color="info" style={{height: '35px'}}>
                                C
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
                                <Button fullWidth={true} disabled={trackingState['rig_state'] === "tracking" || satelliteId === "" || ["none", ""].includes(selectedRadioRig) || ["none", ""].includes(selectedTransmitter)}
                                    variant="contained" color="success" style={{height: '60px'}}
                                    onClick={()=>{handleTrackingStart()}}
                            >
                                TRACK RADIO
                            </Button>
                        </Grid>
                        <Grid size="grow">
                            <Button fullWidth={true} variant="contained" color="error" style={{height: '60px'}}
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