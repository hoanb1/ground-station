import React, { useState, useEffect } from 'react';
import { Box, Typography, IconButton } from '@mui/material';
import ArrowDropUpIcon from '@mui/icons-material/ArrowDropUp';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';

const FrequencyDisplay = ({ initialFrequency = 1000.0, onChange }) => {
    const [frequency, setFrequency] = useState(initialFrequency);

    // Update local state if prop changes
    useEffect(() => {
        setFrequency(initialFrequency);
    }, [initialFrequency]);

    // Convert frequency to string with fixed decimal places (e.g., "1000.000")
    const frequencyString = frequency.toFixed(3);

    // Handle digit adjustment
    const adjustDigit = (position, increment) => {
        // Calculate the power of 10 for this position
        const multiplier = 10 ** position;

        // Calculate the new frequency
        let newFrequency = frequency + (increment * multiplier);

        // Handle edge cases
        if (newFrequency < 0) newFrequency = 0;

        // Round to 3 decimal places to prevent floating point errors
        newFrequency = Math.round(newFrequency * 1000) / 1000;

        // Update state
        setFrequency(newFrequency);

        // Call the onChange callback if provided
        if (onChange) {
            onChange(newFrequency);
        }
    };

    // Create digit components with their controls
    const renderDigitControls = () => {
        const parts = frequencyString.split('.');
        const integerPart = parts[0];
        const decimalPart = parts[1] || '000';

        // Combine parts for display
        const allDigits = integerPart + '.' + decimalPart;

        // Create array of positions (power of 10) for each digit
        const positions = [];
        for (let i = integerPart.length - 1; i >= 0; i--) {
            positions.unshift(integerPart.length - 1 - i);
        }


        // Add decimal positions
        for (let i = 0; i < decimalPart.length; i++) {
            positions.push(-(i + 1));
        }

        return (
            <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                {allDigits.split('').map((digit, index) => {
                    // Skip the decimal point for adjustments
                    if (digit === '.') {
                        return (
                            <Box
                                key={`digit-${index}`}
                                sx={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    mx: 0.5
                                }}
                            >
                                <Box sx={{ height: 24 }}></Box>
                                <Typography variant="h5" sx={{ fontFamily: 'monospace' }}>.</Typography>
                                <Box sx={{ height: 24 }}></Box>
                            </Box>
                        );
                    }

                    const position = positions[index > integerPart.length ? index - 1 : index];

                    return (
                        <Box
                            key={`digit-${index}`}
                            sx={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                mx: 0.5
                            }}
                        >
                            <IconButton
                                size="small"
                                onClick={() => adjustDigit(position, 1)}
                                sx={{ p: 0 }}
                            >
                                <ArrowDropUpIcon />
                            </IconButton>
                            <Typography variant="h5" sx={{ fontFamily: 'monospace' }}>{digit}</Typography>
                            <IconButton
                                size="small"
                                onClick={() => adjustDigit(position, -1)}
                                sx={{ p: 0 }}
                            >
                                <ArrowDropDownIcon />
                            </IconButton>
                        </Box>
                    );
                })}
                <Box sx={{ display: 'flex', alignItems: 'center', ml: 1 }}>
                    <Typography variant="h6">kHz</Typography>
                </Box>
            </Box>
        );
    };

    return (
        <Box sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            my: 2,
            width: '100%'
        }}>
            <Typography variant="subtitle1" gutterBottom>
                Frequency (kHz)
            </Typography>

            <Box sx={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                width: '100%',
                p: 2,
                border: '1px solid #ccc',
                borderRadius: 1,
                bgcolor: 'background.paper'
            }}>
                {renderDigitControls()}
            </Box>
        </Box>
    );
};

export default FrequencyDisplay;