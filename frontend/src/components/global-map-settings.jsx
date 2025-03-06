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
    Typography,
    Divider,
    Stack
} from '@mui/material';
import {styled} from '@mui/material/styles';
import {Tooltip} from "react-leaflet";

const TitleBar = styled(Paper)(({theme}) => ({
    width: '100%',
    height: '30px',
    padding: '3px',
    ...theme.typography.body2,
    textAlign: 'center',
}));

const ThemedStack = styled(Stack)(({theme}) => ({
    color: theme.palette.text.secondary,
    backgroundColor: theme.palette.background.paper,
    borderRadius: theme.shape.borderRadius,
    borderColor: theme.palette.background.paper,
    padding: theme.spacing(0),
}));

const Item = styled('div')(({theme}) => ({
    padding: theme.spacing(1),
}));

const SettingsIsland = () => {
    // Example tile layers for a leaflet map
    const tileLayers = [
        {id: 'osm', name: 'OpenStreetMap'},
        {id: 'satellite', name: 'Satellite'},
        {id: 'topo', name: 'Topographic'},
        // Add more tile layers as needed
    ];

    // Example options for orbit projection time range
    const timeOptions = [
        {value: '1h', label: '1 Hour'},
        {value: '2h', label: '2 Hours'},
        {value: '4h', label: '4 Hours'},
        {value: '8h', label: '8 Hours'},
        // Add more options as needed
    ];

    // State for all settings
    const [selectedTileLayer, setSelectedTileLayer] = useState(tileLayers[0].id);
    const [satelliteCoverage, setSatelliteCoverage] = useState(false);
    const [coverageColor, setCoverageColor] = useState('#ff0000');
    const [orbitPlotting, setOrbitPlotting] = useState(false);
    const [showSun, setShowSun] = useState(true);
    const [showMoon, setShowMoon] = useState(true);
    const [showTerminator, setShowTerminator] = useState(false);
    const [showSatelliteTooltip, setShowSatelliteTooltip] = useState(true);
    const [orbitTimeOption, setOrbitTimeOption] = useState(timeOptions[0].value);

    return (
        <div>
            <TitleBar className={"react-grid-draggable"}>Map settings</TitleBar>
            <ThemedStack spacing={0}>
                {/* Orbit Projection Time Dropdown */}
                <Item>
                    <FormControl fullWidth size={"small"}>
                        <InputLabel id="orbit-time-label">Orbit Projection Time</InputLabel>
                        <Select
                            labelId="orbit-time-label"
                            value={orbitTimeOption}
                            label="Orbit Projection Time"
                            onChange={(e) => setOrbitTimeOption(e.target.value)}
                            variant={"outlined"}
                        >
                            {timeOptions.map((option) => (
                                <MenuItem key={option.value} value={option.value}>
                                    {option.label}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                </Item>
                <Item>
                    <FormControl fullWidth size={"small"}>
                        <InputLabel id="tile-layer-label">Tile Layer</InputLabel>
                        <Select
                            labelId="tile-layer-label"
                            value={selectedTileLayer}
                            label="Tile Layer"
                            onChange={(e) => setSelectedTileLayer(e.target.value)}
                         variant={"outlined"}>
                            {tileLayers.map((layer) => (
                                <MenuItem key={layer.id} value={layer.id}>
                                    {layer.name}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                </Item>
                <Item>
                    <FormControlLabel
                        style={{padding: '0rem 0rem 0rem 1rem'}}
                        control={
                            <Switch
                                size={"small"}
                                checked={satelliteCoverage}
                                onChange={(e) => setSatelliteCoverage(e.target.checked)}
                            />
                        }
                        label="Satellite Coverage"
                    />
                </Item>
                <Item>
                    <FormControlLabel
                        style={{padding: '0rem 0rem 0rem 1rem'}}
                        control={
                            <input
                                type="color"
                                value={coverageColor}
                                onChange={(e) => setCoverageColor(e.target.value)}
                                style={{
                                    width: '50px',
                                    height: '20px',
                                    border: 'none',
                                    background: 'none',
                                }}
                            />
                        }
                        label="Orbit line color"
                    />
                </Item>
                <Item>
                    <FormControlLabel
                        style={{padding: '0rem 0rem 0rem 1rem'}}
                        control={
                            <Switch
                                size={"small"}
                                checked={orbitPlotting}
                                onChange={(e) => setOrbitPlotting(e.target.checked)}
                            />
                        }
                        label="Orbit Plotting"
                    />
                </Item>
                <Item>
                    <FormControlLabel style={{padding: '0rem 0rem 0rem 1rem'}}
                        control={
                            <Switch
                                size={"small"}
                                checked={showSun}
                                onChange={(e) => setShowSun(e.target.checked)}
                            />
                        }
                        label="Show Sun"
                    />
                </Item>
                <Item>
                    <FormControlLabel style={{padding: '0rem 0rem 0rem 1rem'}}
                        control={
                            <Switch
                                size={"small"}
                                checked={showMoon}
                                onChange={(e) => setShowMoon(e.target.checked)}
                            />
                        }
                        label="Show Moon"
                    />
                </Item>
                <Item>
                    <FormControlLabel style={{padding: '0rem 0rem 0rem 1rem'}}
                        control={
                            <Switch
                                size={"small"}
                                checked={showTerminator}
                                onChange={(e) => setShowTerminator(e.target.checked)}
                            />
                        }
                        label="Day/Night Terminator"
                    />
                </Item>
                <Item>
                    <FormControlLabel style={{padding: '0rem 0rem 0rem 1rem'}}
                        control={
                            <Switch
                                size={"small"}
                                checked={showSatelliteTooltip}
                                onChange={(e) => setShowSatelliteTooltip(e.target.checked)}
                            />
                        }
                        label="Satellite Tooltip"
                    />
                </Item>
            </ThemedStack>
        </div>
    );
};

export default SettingsIsland;
