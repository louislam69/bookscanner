import { useState } from "react";
import BuchListe from "./views/BuchListe";
import BuchAnsicht from "./views/BuchAnsicht";
import ScanAnsicht from "./views/ScanAnsicht";
import KartenEditor from "./views/KartenEditor";
import LernModus from "./views/LernModus";
import EinstellungenAnsicht from "./views/EinstellungenAnsicht";

export type Ansicht =
  | { name: "liste" }
  | { name: "buch"; buchId: string }
  | { name: "scan"; buchId: string }
  | { name: "karte"; karteId: string; buchId: string }
  | { name: "lernen"; buchId: string }
  | { name: "einstellungen" };

export default function App() {
  const [ansicht, setAnsicht] = useState<Ansicht>({ name: "liste" });

  switch (ansicht.name) {
    case "liste":
      return <BuchListe navigiere={setAnsicht} />;
    case "buch":
      return <BuchAnsicht buchId={ansicht.buchId} navigiere={setAnsicht} />;
    case "scan":
      return <ScanAnsicht buchId={ansicht.buchId} navigiere={setAnsicht} />;
    case "karte":
      return (
        <KartenEditor
          karteId={ansicht.karteId}
          buchId={ansicht.buchId}
          navigiere={setAnsicht}
        />
      );
    case "lernen":
      return <LernModus buchId={ansicht.buchId} navigiere={setAnsicht} />;
    case "einstellungen":
      return <EinstellungenAnsicht navigiere={setAnsicht} />;
  }
}
