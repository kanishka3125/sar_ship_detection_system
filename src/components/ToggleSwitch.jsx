import "./toggle.css";

export default function ToggleSwitch({ is3D, setIs3D }) {
    return (
        <div className="toggle-cont">
            <input
                className="toggle-input"
                id="toggle"
                type="checkbox"
                checked={is3D}
                onChange={() => setIs3D(!is3D)}
            />

            <label className="toggle-label" htmlFor="toggle">
                <div className="cont-icon">
                    {[...Array(20)].map((_, i) => (
                        <span
                            key={i}
                            className="sparkle"
                            style={{
                                "--width": Math.random() > 0.5 ? 2 : 1,
                                "--deg": Math.random() * 360,
                                "--duration": Math.random() * 20 + 1,
                            }}
                        ></span>
                    ))}

                    <svg viewBox="0 0 30 30" className="icon">
                        <path d="M0.96233 28.61C1.36043 29.0081 1.96007 29.1255 2.47555 28.8971L10.4256 25.3552C13.2236 24.11 16.4254 24.1425 19.2107 25.4401L27.4152 29.2747..." />
                    </svg>
                </div>
            </label>
        </div>
    );
}