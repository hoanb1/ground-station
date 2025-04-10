import {createAsyncThunk, createSlice} from '@reduxjs/toolkit';
import {enqueueSnackbar} from 'notistack';

const fetchWeatherByCoordinates = async (latitude, longitude, apiKey="471aacccad269b47ed7d2aa3369c9f71") => {
    try {
        const response = await fetch(
            `https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&units=metric&appid=${apiKey}`
        );
        if (!response.ok) {
            throw new Error('Weather data could not be fetched');
        }
        const data = await response.json();
        return {
            temperature: data.main.temp,
            description: data.weather[0].description,
            humidity: data.main.humidity,
            windSpeed: data.wind.speed,
            location: data.name,
            icon: data.weather[0].icon,
            feels_like: data.main.feels_like,
            pressure: data.main.pressure
        };
    } catch (error) {
        console.error('Error fetching weather data:', error);
        throw error;
    }
};


export const getWeatherData = createAsyncThunk(
    'weather/getWeatherData',
    async ({ latitude, longitude, apiKey }, { rejectWithValue }) => {
        try {
            return await fetchWeatherByCoordinates(latitude, longitude, apiKey);
        } catch (error) {
            enqueueSnackbar('Failed to fetch weather data', { variant: 'error' });
            return rejectWithValue(error.message);
        }
    }
);

const weatherSlice = createSlice({
    name: 'weather',
    initialState: {
        data: null,
        loading: false,
        error: null,
    },
    reducers: {},
    extraReducers: (builder) => {
        builder
            .addCase(getWeatherData.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(getWeatherData.fulfilled, (state, action) => {
                state.loading = false;
                state.data = action.payload;
            })
            .addCase(getWeatherData.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            });
    },
});

export default weatherSlice.reducer;