import PositionDepthChart from "../PositionDepthChart";

export default function PositionDepthChartExample() {
  // todo: remove mock functionality
  const mockDepthData = {
    QB: {
      grade: "A",
      players: [
        { id: "1", name: "Josh Allen", team: "BUF", points: 285.4, medianPoints: 220, percentAboveMedian: 30 },
        { id: "2", name: "Tua Tagovailoa", team: "MIA", points: 180.2, medianPoints: 220, percentAboveMedian: -18 },
      ],
    },
    RB: {
      grade: "B+",
      players: [
        { id: "3", name: "Saquon Barkley", team: "PHI", points: 245.2, medianPoints: 150, percentAboveMedian: 63 },
        { id: "4", name: "Bijan Robinson", team: "ATL", points: 198.7, medianPoints: 150, percentAboveMedian: 32 },
        { id: "5", name: "Tank Bigsby", team: "JAX", points: 89.6, medianPoints: 150, percentAboveMedian: -40 },
      ],
    },
    WR: {
      grade: "A-",
      players: [
        { id: "6", name: "Ja'Marr Chase", team: "CIN", points: 232.8, medianPoints: 140, percentAboveMedian: 66 },
        { id: "7", name: "Davante Adams", team: "NYJ", points: 145.3, medianPoints: 140, percentAboveMedian: 4 },
        { id: "8", name: "Marvin Harrison Jr", team: "ARI", points: 112.4, medianPoints: 140, percentAboveMedian: -20 },
      ],
    },
    TE: {
      grade: "C+",
      players: [
        { id: "9", name: "Travis Kelce", team: "KC", points: 168.5, medianPoints: 100, percentAboveMedian: 68 },
        { id: "10", name: "Cole Kmet", team: "CHI", points: 72.3, medianPoints: 100, percentAboveMedian: -28 },
      ],
    },
  };

  return <PositionDepthChart depthData={mockDepthData} />;
}
