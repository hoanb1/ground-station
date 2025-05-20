import React, {useState} from 'react';
import {Box, Tab, Tabs} from '@mui/material';
import RotatorControl from '../target/rotator-control.jsx'
import RigControl from '../waterfall/rig-control.jsx'
import {getClassNamesBasedOnGridEditing, TitleBar} from "./common.jsx";
import {useSelector} from "react-redux";
import {styled} from "@mui/material/styles";


function TabPanel({children, value, index}) {
    return (
        <div hidden={value !== index} role="tabpanel">
            {value === index && <Box sx={{p: 0}}>{children}</Box>}
        </div>
    );
}

export const HardwareTabs = styled(Tabs)({
    '&.MuiTabs-root': {
        //minHeight: 38,
        //height: 38,
    },
    '& .MuiTabs-indicator': {
        position: 'absolute',
        top: 0,
        height: 3,
        backgroundColor: 'primary.main',
        '&.Mui-disabled': {
            display: 'none',
        },
    },
    '& .MuiTab-root': {
        textTransform: 'uppercase',
        fontSize: '0.9rem',
        fontWeight: 500,
        //minHeight: 38,
        backgroundColor: '#1c1c1c',
        '&:hover': {
            backgroundColor: 'action.hover',
        },
    },
    '&.Mui-selected' : {
        backgroundColor: '#2b2b2b',
    },
    '& .MuiButtonBase-root' : {
        //minHeight: 38,
        //padding: 0,
    }
});


export default function ControllerTabs({waterfallSettingsComponentRef}) {
    const [activeTab, setActiveTab] = useState(0);
    const {
        gridEditable: isTargetGridEditable,
    } = useSelector(state => state.targetSatTrack);

    const {
        gridEditable: isWaterfallGridEditable,
    } = useSelector(state => state.waterfall);

    const handleTabChange = (event, newValue) => {
        setActiveTab(newValue);
    };

    return (
        <>
            <TitleBar
                className={getClassNamesBasedOnGridEditing(isTargetGridEditable || isWaterfallGridEditable, ["window-title-bar"])}>Hardware
                control</TitleBar>
            <Box sx={{
                width: '100%',
                bgcolor: 'background.paper'
            }}>
                <Box sx={{
                    borderBottom: 1,
                    borderColor: 'divider'
                }}>
                    <HardwareTabs
                        value={activeTab}
                        onChange={handleTabChange}
                        variant="fullWidth"
                        textColor="primary"
                        indicatorColor="primary"
                    >
                        <Tab label="Rotator" sx={{}}/>
                        <Tab label="Rig" sx={{}}/>
                    </HardwareTabs>
                </Box>
                <TabPanel value={activeTab} index={0}>
                    <RotatorControl/>
                </TabPanel>
                <TabPanel value={activeTab} index={1}>
                    <RigControl waterfallSettingsComponentRef={waterfallSettingsComponentRef}/>
                </TabPanel>
            </Box>
        </>
    );
}