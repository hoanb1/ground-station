import React, {useState} from 'react';
import {Box, Tab, Tabs} from '@mui/material';
import RotatorControl from '../target/rotator-control.jsx'
import RigControl from '../waterfall/rig-control.jsx'
import {getClassNamesBasedOnGridEditing, TitleBar} from "./common.jsx";
import {useSelector} from "react-redux";


function TabPanel({children, value, index}) {
    return (
        <div hidden={value !== index} role="tabpanel">
            {value === index && <Box sx={{p: 0}}>{children}</Box>}
        </div>
    );
}

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
            <Box sx={{width: '100%'}}>
                <Box sx={{borderBottom: 1, borderColor: 'divider'}}>
                    <Tabs value={activeTab} onChange={handleTabChange} variant="fullWidth">
                        <Tab label="Rotator"/>
                        <Tab label="Rig"/>
                    </Tabs>
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
