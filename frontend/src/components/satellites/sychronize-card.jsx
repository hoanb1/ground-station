import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Card, Box, CardContent, Typography, Button } from '@mui/material';
import { enqueueSnackbar } from 'notistack';
import { useSocket } from '../common/socket.jsx';
import {
    startSatelliteSync,
    setProgress,
    setMessage,
} from './synchronize-slice.jsx';
import PropTypes from "prop-types";
import {styled} from "@mui/material/styles";
import LinearProgress, {linearProgressClasses} from "@mui/material/LinearProgress";


function LinearProgressWithLabel(props) {
    return (
        <Box sx={{display: 'flex', alignItems: 'center'}}>
            <Box sx={{width: '100%', mr: 1}}>
                <LinearProgress variant="determinate" {...props} />
            </Box>
            <Box sx={{minWidth: 35}}>
                <Typography variant="body2" sx={{color: 'text.secondary'}}>
                    {`${Math.round(props.value)}%`}
                </Typography>
            </Box>
        </Box>
    );
}

function LinearWithValueLabel({progress}) {

    const BorderLinearProgress = styled(LinearProgress)(({theme}) => ({
        height: 20,
        borderRadius: 5,
        [`&.${linearProgressClasses.colorPrimary}`]: {
            backgroundColor: theme.palette.grey[200],
            ...theme.applyStyles('dark', {
                backgroundColor: theme.palette.grey[800],
            }),
        },
        [`& .${linearProgressClasses.bar}`]: {
            borderRadius: 5,
            backgroundColor: '#1a90ff',
            ...theme.applyStyles('dark', {
                backgroundColor: '#308fe8',
            }),
        },
    }));

    return (
        <Box sx={{display: 'flex', alignItems: 'left', width: '100%'}}>
            <Box sx={{width: '100%', mr: 1}}>
                <BorderLinearProgress
                    value={progress}
                    variant="determinate"
                />
            </Box>
            <Box sx={{minWidth: 35}}>
                <Typography variant="body2" sx={{color: 'text.secondary'}}>
                    {`${Math.round(progress)}%`}
                </Typography>
            </Box>
        </Box>
    );
}

LinearProgressWithLabel.propTypes = {
    /**
     * The value of the progress indicator for the determinate and buffer variants.
     * Value between 0 and 100.
     */
    value: PropTypes.number.isRequired,
};


const SynchronizeTLEsCard = function () {
    const dispatch = useDispatch();
    const { socket } = useSocket();

    // Redux state
    const { progress, message, status } = useSelector((state) => state.syncSatellite);

    // When user clicks "Synchronize" button
    const handleSynchronizeSatellites = async () => {
        // Dispatch async thunk to initiate sync
        dispatch(startSatelliteSync({ socket }));
    };

    return (
        <Card sx={{ display: 'flex', marginTop: 2, marginBottom: 0 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', width: '40%' }}>
                <CardContent sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                    <Typography component="div" variant="h6">
                        Fetch data from TLE sources
                    </Typography>
                    <Typography variant="subtitle1" component="div" sx={{ color: 'text.secondary' }}>
                        Click to start
                    </Typography>
                </CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', pl: 1, pb: 1, padding: 2 }}>
                    <Button variant="contained" color="primary" onClick={handleSynchronizeSatellites}>
                        Synchronize
                    </Button>
                </Box>
            </Box>

            <Box
                sx={{
                    width: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center',
                    paddingRight: 2,
                }}
            >
                <Box sx={{ display: 'flex', flexDirection: 'column', width: '90%' }}>
                    <LinearWithValueLabel progress={progress} />
                </Box>
                <Box sx={{ display: 'flex', flexDirection: 'column', width: '90%', marginTop: 1 }}>
                    {message}
                </Box>
            </Box>
        </Card>
    );
};

export default SynchronizeTLEsCard;