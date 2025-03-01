import React, { useState } from 'react';

function SettingsTabs() {
    const [activeTab, setActiveTab] = useState('home');

    const renderActiveForm = () => {
        switch (activeTab) {
            case 'home':
                return (
                    <form>
                        <h2>Home Configuration</h2>
                        <div>
                            <label htmlFor="home-field-1">Home Field 1:</label>
                            <input type="text" id="home-field-1" placeholder="Enter value..." />
                        </div>
                        <div>
                            <label htmlFor="home-field-2">Home Field 2:</label>
                            <input type="text" id="home-field-2" placeholder="Enter value..." />
                        </div>
                        <button type="submit">Save Home Config</button>
                    </form>
                );
            case 'preferences':
                return (
                    <form>
                        <h2>Preferences Configuration</h2>
                        <div>
                            <label htmlFor="pref-field-1">Preference Field 1:</label>
                            <input type="text" id="pref-field-1" placeholder="Enter value..." />
                        </div>
                        <div>
                            <label htmlFor="pref-field-2">Preference Field 2:</label>
                            <input type="text" id="pref-field-2" placeholder="Enter value..." />
                        </div>
                        <button type="submit">Save Preferences</button>
                    </form>
                );
            case 'rotorControl':
                return (
                    <form>
                        <h2>Rotor Control Configuration</h2>
                        <div>
                            <label htmlFor="rotor-field-1">Rotor Field 1:</label>
                            <input type="text" id="rotor-field-1" placeholder="Enter value..." />
                        </div>
                        <div>
                            <label htmlFor="rotor-field-2">Rotor Field 2:</label>
                            <input type="text" id="rotor-field-2" placeholder="Enter value..." />
                        </div>
                        <button type="submit">Save Rotor Control</button>
                    </form>
                );
            case 'tles':
                return (
                    <form>
                        <h2>TLEs Configuration</h2>
                        <div>
                            <label htmlFor="tles-field-1">TLE Field 1:</label>
                            <input type="text" id="tles-field-1" placeholder="Enter value..." />
                        </div>
                        <div>
                            <label htmlFor="tles-field-2">TLE Field 2:</label>
                            <input type="text" id="tles-field-2" placeholder="Enter value..." />
                        </div>
                        <button type="submit">Save TLEs</button>
                    </form>
                );
            default:
                return null;
        }
    };

    return (
        <div>
            {/* Tab Buttons */}
            <div style={{ marginBottom: '1rem' }}>
                <button
                    onClick={() => setActiveTab('home')}
                    style={{ fontWeight: activeTab === 'home' ? 'bold' : 'normal' }}
                >
                    Home
                </button>
                <button
                    onClick={() => setActiveTab('preferences')}
                    style={{ fontWeight: activeTab === 'preferences' ? 'bold' : 'normal' }}
                >
                    Preferences
                </button>
                <button
                    onClick={() => setActiveTab('rotorControl')}
                    style={{ fontWeight: activeTab === 'rotorControl' ? 'bold' : 'normal' }}
                >
                    Rotor control
                </button>
                <button
                    onClick={() => setActiveTab('tles')}
                    style={{ fontWeight: activeTab === 'tles' ? 'bold' : 'normal' }}
                >
                    TLEs
                </button>
            </div>

            {/* Active Form */}
            <div>{renderActiveForm()}</div>
        </div>
    );
}

export default SettingsTabs;
