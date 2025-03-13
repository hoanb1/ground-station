import React, {useState} from 'react';
import {
    Box,
    Paper,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Switch,
    FormControlLabel,
    Stack
} from '@mui/material';
import {styled} from '@mui/material/styles';
import {tileLayers, getTileLayerById} from './tile-layer.jsx';
import {TitleBar} from './common.jsx';

const ThemedStack = styled(Stack)(({theme}) => ({
    color: theme.palette.text.secondary,
    backgroundColor: "#1e1e1e",
    borderRadius: theme.shape.borderRadius,
    borderColor: theme.palette.background.paper,
    padding: theme.spacing(0),
    marginTop: "15px",

}));

const ThemedSettingsDiv = styled('div')(({theme}) => ({
    backgroundColor: "#1e1e1e",
    fontsize: '0.9rem !important',
    height: "100%",
}));

const SettingItem = styled('div')(({theme}) => ({
    padding: theme.spacing(1),
    fontsize: '0.9rem !important',
}));

const SettingsIsland = ({ initialShowPastOrbitPath, initialShowFutureOrbitPath, initialShowSatelliteCoverage,
                            initialShowSunIcon, initialShowMoonIcon, initialShowTerminatorLine,
                            initialSatelliteCoverageColor, initialPastOrbitLineColor, initialFutureOrbitLineColor,
                            initialOrbitProjectionDuration, initialTileLayerID, handleShowFutureOrbitPath, handleShowPastOrbitPath,
                            handleShowSatelliteCoverage, handleSetShowSunIcon, handleSetShowMoonIcon,
                            handleShowTerminatorLine, handleFutureOrbitLineColor, handlePastOrbitLineColor,
                            handleSatelliteCoverageColor, handleOrbitProjectionDuration, handleTileLayerID}) => {

    // Example options for orbit projection time range
    const timeOptions = [
        {value: '60',  label: '1 Hour'},
        {value: '120', label: '2 Hours'},
        {value: '240', label: '4 Hours'},
        {value: '480', label: '8 Hours'},
        {value: '720', label: '12 Hours'},
        {value: '1440', label: '24 Hours'},
    ];

    // State for all settings
    const [satelliteCoverage, setSatelliteCoverage] = useState(initialShowSatelliteCoverage);
    const [showPastOrbitPlot, setShowPastOrbitPlot] = useState(initialShowPastOrbitPath);
    const [showFutureOrbitPlot, setShowFutureOrbitPlot] = useState(initialShowFutureOrbitPath);
    const [showSun, setShowSun] = useState(initialShowSunIcon);
    const [showMoon, setShowMoon] = useState(initialShowMoonIcon);
    const [showTerminator, setShowTerminator] = useState(initialShowTerminatorLine);
    const [showSatelliteTooltip, setShowSatelliteTooltip] = useState(true);
    const [pastOrbitLineColor, setPastOrbitLineColor] = useState(initialPastOrbitLineColor);
    const [futureOrbitLineColor, setFutureOrbitLineColor] = useState(initialFutureOrbitLineColor);
    const [coverageColor, setCoverageColor] = useState(initialSatelliteCoverageColor);
    const [orbitProjectionDuration, setOrbitProjectionDuration] = useState(initialOrbitProjectionDuration);
    const [tileLayerID, setTileLayerID] = useState(initialTileLayerID);

    return (
        <ThemedSettingsDiv>
            <TitleBar className={"react-grid-draggable window-title-bar"}>Map settings</TitleBar>
            <ThemedStack spacing={0}>
                <SettingItem>
                    <FormControl fullWidth size={"small"}>
                        <InputLabel id="orbit-time-label">Orbit Projection Time</InputLabel>
                        <Select
                            labelId="orbit-time-label"
                            value={orbitProjectionDuration}
                            label="Orbit Projection Time"
                            onChange={(e) => {
                                handleOrbitProjectionDuration(e.target.value);
                                setOrbitProjectionDuration(e.target.value);
                            }}
                            variant={"outlined"}
                        >
                            {timeOptions.map((option) => (
                                <MenuItem key={option.value} value={option.value}>
                                    {option.label}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                </SettingItem>
                <SettingItem>
                    <FormControl fullWidth size={"small"}>
                        <InputLabel id="tile-layer-label">Tile Layer</InputLabel>
                        <Select
                            labelId="tile-layer-label"
                            value={tileLayerID}
                            label="Tile Layer"
                            onChange={(e) => {setTileLayerID(e.target.value); handleTileLayerID(e.target.value);}}
                         variant={"outlined"}>
                            {tileLayers.map((layer) => (
                                <MenuItem key={layer.id} value={layer.id}>
                                    {layer.name}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                </SettingItem>
                <SettingItem>
                    <FormControlLabel
                        style={{padding: '0rem 0rem 0rem 1rem'}}
                        control={
                            <Switch
                                size={"small"}
                                checked={satelliteCoverage}
                                onChange={(e) => {
                                    handleShowSatelliteCoverage(e.target.checked);
                                    setSatelliteCoverage(e.target.checked);
                                }}
                            />
                        }
                        label="Satellite coverage"
                    />
                </SettingItem>
                <SettingItem>
                    <FormControlLabel
                        style={{padding: '0rem 0rem 0rem 1rem'}}
                        control={
                            <Switch
                                size={"small"}
                                checked={showPastOrbitPlot}
                                onChange={(e) => {
                                    handleShowPastOrbitPath(e.target.checked);
                                    setShowPastOrbitPlot(e.target.checked);
                                }}
                            />
                        }
                        label="Past orbit path plotting"
                    />
                </SettingItem>
                <SettingItem>
                    <FormControlLabel
                        style={{padding: '0rem 0rem 0rem 1rem'}}
                        control={
                            <Switch
                                size={"small"}
                                checked={showFutureOrbitPlot}
                                onChange={(e) => {
                                    handleShowFutureOrbitPath(e.target.checked);
                                    setShowFutureOrbitPlot(e.target.checked);
                                }}
                            />
                        }
                        label="Future orbit path plotting"
                    />
                </SettingItem>
                <SettingItem>
                    <FormControlLabel style={{padding: '0rem 0rem 0rem 1rem'}}
                        control={
                            <Switch
                                size={"small"}
                                checked={showSun}
                                onChange={(e) => {
                                    handleSetShowSunIcon(e.target.checked);
                                    setShowSun(e.target.checked);
                                }}
                            />
                        }
                        label="Show the sun"
                    />
                </SettingItem>
                <SettingItem>
                    <FormControlLabel style={{padding: '0rem 0rem 0rem 1rem'}}
                        control={
                            <Switch
                                size={"small"}
                                checked={showMoon}
                                onChange={(e) => {
                                    handleSetShowMoonIcon(e.target.checked);
                                    setShowMoon(e.target.checked);
                                }}
                            />
                        }
                        label="Show the moon"
                    />
                </SettingItem>
                <SettingItem>
                    <FormControlLabel style={{padding: '0rem 0rem 0rem 1rem'}}
                        control={
                            <Switch
                                size={"small"}
                                checked={showTerminator}
                                onChange={(e) => {
                                    handleShowTerminatorLine(e.target.checked);
                                    setShowTerminator(e.target.checked);
                                }}
                            />
                        }
                        label="Day/night seperator line"
                    />
                </SettingItem>
                <SettingItem>
                    <FormControlLabel style={{padding: '0rem 0rem 0rem 1rem'}}
                        control={
                            <Switch
                                size={"small"}
                                checked={showSatelliteTooltip}
                                onChange={(e) => setShowSatelliteTooltip(e.target.checked)}
                            />
                        }
                        label="Satellite tooltip"
                    />
                </SettingItem>
                <SettingItem>
                    <FormControlLabel
                        style={{padding: '0rem 0rem 0rem 1rem'}}
                        control={
                            <input
                                type="color"
                                value={coverageColor}
                                onChange={(e) => {
                                    handleSatelliteCoverageColor(e.target.value);
                                    setCoverageColor(e.target.value);
                                }}
                                style={{
                                    width: '40px',
                                    height: '24px',
                                    border: 'none',
                                    background: 'none',
                                }}
                            />
                        }
                        label="Footprint color"
                    />
                </SettingItem>
                <SettingItem>
                    <FormControlLabel
                        style={{padding: '0rem 0rem 0rem 1rem'}}
                        control={
                            <input
                                type="color"
                                value={pastOrbitLineColor}
                                onChange={(e) => {
                                    handlePastOrbitLineColor(e.target.value);
                                    setPastOrbitLineColor(e.target.value);
                                }}
                                style={{
                                    width: '40px',
                                    height: '24px',
                                    border: 'none',
                                    background: 'none',
                                }}
                            />
                        }
                        label="Past orbit line color"
                    />
                </SettingItem>
                <SettingItem>
                    <FormControlLabel
                        style={{padding: '0rem 0rem 0rem 1rem'}}
                        control={
                            <input
                                type="color"
                                value={futureOrbitLineColor}
                                onChange={(e) => {
                                    handleFutureOrbitLineColor(e.target.value);
                                    setFutureOrbitLineColor(e.target.value);
                                }}
                                style={{
                                    width: '40px',
                                    height: '24px',
                                    border: 'none',
                                    background: 'none',
                                }}
                            />
                        }
                        label="Future orbit line color"
                    />
                </SettingItem>
            </ThemedStack>
        </ThemedSettingsDiv>
    );
};

export default SettingsIsland;
