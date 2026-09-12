import { useState } from "react";
import { Check } from "lucide-react";
import { GATEKEEPERS, TEXT, validationText, type Language, type Player } from "./presentation";

export function LeaderSelector({
  language,
  player,
  error,
  onChange,
}: {
  language: Language;
  player: Player;
  error?: string;
  onChange: (key: keyof Player, value: string) => void;
}) {
  const ui = TEXT[language];
  const [gatekeeperChoice, setGatekeeperChoice] = useState(() =>
    GATEKEEPERS.includes(player.gatekeeper)
      ? player.gatekeeper
      : player.gatekeeper
        ? "__custom__"
        : "",
  );
  return (
    <div className={"field gatekeeper-field" + (error ? " is-invalid" : "")}>
      <span id="gatekeeper-label" className="field-label">
        {ui.gatekeeper}
      </span>
      <div className="gatekeeper-picks" role="group" aria-labelledby="gatekeeper-label">
        {GATEKEEPERS.map((name) => (
          <button
            key={name}
            type="button"
            className={"gatekeeper-pick" + (gatekeeperChoice === name ? " is-on" : "")}
            aria-pressed={gatekeeperChoice === name}
            onClick={() => {
              setGatekeeperChoice(name);
              onChange("gatekeeper", name);
            }}
          >
            {name}
            <Check size={14} aria-hidden="true" className="selection-check" />
          </button>
        ))}
        <button
          type="button"
          className={"gatekeeper-pick" + (gatekeeperChoice === "__custom__" ? " is-on" : "")}
          aria-pressed={gatekeeperChoice === "__custom__"}
          onClick={() => {
            setGatekeeperChoice("__custom__");
            if (GATEKEEPERS.includes(player.gatekeeper)) onChange("gatekeeper", "");
          }}
        >
          {ui.customGatekeeper}
          <Check size={14} aria-hidden="true" className="selection-check" />
        </button>
      </div>
      {gatekeeperChoice === "__custom__" ? (
        <input
          id="gatekeeper-custom"
          name="gatekeeper"
          value={player.gatekeeper}
          maxLength={20}
          autoComplete="off"
          onChange={(e) => onChange("gatekeeper", e.target.value.slice(0, 20))}
          placeholder={ui.customGatekeeperPlaceholder}
          aria-label={ui.customGatekeeperPlaceholder}
        />
      ) : null}
      <span className="field-err">{validationText(error, language)}</span>
    </div>
  );
}
