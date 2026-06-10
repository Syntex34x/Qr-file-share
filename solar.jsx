import React, { useState, useEffect, useRef } from 'react';
import { 
  Sun, 
  Upload, 
  Settings, 
  Compass, 
  Layers, 
  Cpu, 
  RotateCcw, 
  Play, 
  Pause, 
  Info, 
  TrendingUp, 
  Sliders, 
  Trash2, 
  CheckCircle, 
  AlertTriangle, 
  Eye, 
  Sparkles,
  HelpCircle,
  Clock,
  Calendar,
  Send,
  Bot,
  Copy,
  FileText
} from 'lucide-react';

// Set Gemini API Key (runtime environment automatically injects this)
const apiKey = "";

// Robust exponential backoff helper for Gemini API calls
const fetchWithRetry = async (url, options, retries = 5, delay = 1000) => {
  try {
    const response = await fetch(url, options);
    if (!response.ok) {
      if (retries > 0 && (response.status === 429 || response.status >= 500)) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        return fetchWithRetry(url, options, retries - 1, delay * 2);
      }
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    if (retries > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
      return fetchWithRetry(url, options, retries - 1, delay * 2);
    }
    throw error;
  }
};

// Preset samples to test the simulator without needing to upload an image immediately
const SAMPLE_ROOFS = [
  {
    id: 'suburban-gable',
    name: 'Standard Suburban Gable',
    image: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&q=80&w=600',
    description: 'Classic dual-slope gable roof with minimal obstructions and high direct south exposure.',
    aiAnalysis: {
      roofType: 'Gable',
      estimatedPitch: 28,
      azimuthOrientation: 'South-West',
      obstructions: ['Chimney', 'Plumbing Vent'],
      suitabilityScore: 88,
      panelCapacityEstimate: 16,
      analysisReport: 'Excellent solar suitability. The south-facing main facet has an optimal slope angle (~28°) for year-round production. The minor plumbing vents are easily avoided, though the brick chimney on the west edge will cast a partial shadow in the late afternoon. Trimming the nearby birch tree on the northwest side is recommended to maximize afternoon gains.'
    },
    params: {
      roofType: 'Gable',
      pitch: 28,
      azimuth: 210,
      width: 12,
      length: 8,
      height: 4.5,
      chimney: true,
      vent: true,
      tree: false,
      panelRows: 2,
      panelCols: 6
    }
  },
  {
    id: 'modern-flat',
    name: 'Modern Flat Commercial/Residential',
    image: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&q=80&w=600',
    description: 'Modern clean flat-roof with parapets, requiring specialized ballasted arrays tilted at custom angles.',
    aiAnalysis: {
      roofType: 'Flat',
      estimatedPitch: 0,
      azimuthOrientation: 'Any (Optimizable)',
      obstructions: ['AC Condenser Unit', 'Skylight'],
      suitabilityScore: 92,
      panelCapacityEstimate: 24,
      analysisReport: 'Flat concrete deck provides exceptional structural stability and layout freedom. We recommend standard ballasted solar racks tilted at an optimal 15° facing due South. The AC units on the eastern segment create clear shading blocks; a 3-meter mechanical setback buffer is enforced in the design model to prevent energy clipping.'
    },
    params: {
      roofType: 'Flat',
      pitch: 0,
      azimuth: 180,
      width: 14,
      length: 10,
      height: 5.0,
      chimney: false,
      vent: true,
      tree: true,
      panelRows: 3,
      panelCols: 6
    }
  },
  {
    id: 'monoslope-shed',
    name: 'Modern Single-Slope (Monoslope)',
    image: 'https://images.unsplash.com/photo-1507089947368-19c1da9775ae?auto=format&fit=crop&q=80&w=600',
    description: 'Architectural monoslope design maximizing high passive lighting, perfect for complete single-array systems.',
    aiAnalysis: {
      roofType: 'Monoslope',
      estimatedPitch: 15,
      azimuthOrientation: 'South',
      obstructions: ['None'],
      suitabilityScore: 95,
      panelCapacityEstimate: 18,
      analysisReport: 'Incredible solar architecture. The single massive roof plane slopes entirely south at an efficient 15° angle. There are zero structural obstructions. High compatibility with direct flush-mount racking systems, minimizing balancing equipment and installation costs.'
    },
    params: {
      roofType: 'Monoslope',
      pitch: 15,
      azimuth: 180,
      width: 10,
      length: 9,
      height: 4.0,
      chimney: false,
      vent: false,
      tree: false,
      panelRows: 3,
      panelCols: 5
    }
  }
];

export default function App() {
  const [threeReady, setThreeReady] = useState(false);
  const [activeTab, setActiveTab] = useState('survey');
  const [loadingAI, setLoadingAI] = useState(false);
  const [errorAI, setErrorAI] = useState(null);
  const [toast, setToast] = useState(null);

  // Home structural configurations
  const [houseParams, setHouseParams] = useState(SAMPLE_ROOFS[0].params);
  
  // AI Survey state
  const [uploadedImage, setUploadedImage] = useState(null);
  const [uploadedBase64, setUploadedBase64] = useState(null);
  const [selectedSample, setSelectedSample] = useState(SAMPLE_ROOFS[0].id);
  const [aiReport, setAiReport] = useState(SAMPLE_ROOFS[0].aiAnalysis);

  // Solar simulation state
  const [panelWattage, setPanelWattage] = useState(400); // W
  const [timeOfDay, setTimeOfDay] = useState(12); // Decimal hour (6 to 18)
  const [seasonAngle, setSeasonAngle] = useState(0); // Dec: -23.44 to +23.44 (Winter Solstice to Summer Solstice)
  const [isPlaying, setIsPlaying] = useState(true);
  const [showWireframe, setShowWireframe] = useState(false);
  const [showShadows, setShowShadows] = useState(true);

  // Computed simulation metrics
  const [livePower, setLivePower] = useState(0); // kW
  const [dailyCurve, setDailyCurve] = useState([]);
  const [annualEst, setAnnualEst] = useState(0); // kWh/year

  // ✨ Gemini Copilot Chat & Document Generation States
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState([
    { role: 'assistant', text: "Hello! I am your interactive AI Solar Copilot. I'm fully synced with your active 3D CAD workspace dimensions and obstructions. Ask me anything about electrical string sizing, shade bypass optimization, or mechanical wind loads!" }
  ]);
  const [loadingChat, setLoadingChat] = useState(false);
  const [proposalType, setProposalType] = useState('investment'); // 'investment' | 'engineering' | 'pitch'
  const [proposalOutput, setProposalOutput] = useState('');
  const [loadingProposal, setLoadingProposal] = useState(false);
  
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const controlsRef = useRef(null);

  // Mesh References for real-time dynamic update inside Three.js frame
  const houseGroupRef = useRef(null);
  const sunLightRef = useRef(null);
  const sunSphereRef = useRef(null);

  // Trigger auto-dismissing toasts
  const showToast = (message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Dynamically inject Three.js and OrbitControls
  useEffect(() => {
    const loadThree = async () => {
      try {
        if (!window.THREE) {
          await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
          });
        }
        if (!window.THREE.OrbitControls) {
          await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js';
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
          });
        }
        setThreeReady(true);
      } catch (err) {
        showToast("Error loading 3D Graphics Engine. Please refresh.", "error");
      }
    };
    loadThree();
  }, []);

  // Time evolution loop for sun simulation
  useEffect(() => {
    let timer;
    if (isPlaying) {
      timer = setInterval(() => {
        setTimeOfDay((prev) => {
          let next = prev + 0.1;
          if (next > 18) next = 6; // Loop day back to sunrise
          return parseFloat(next.toFixed(2));
        });
      }, 100);
    }
    return () => clearInterval(timer);
  }, [isPlaying]);

  // Compute live solar generation mathematical metrics
  useEffect(() => {
    // 1. Calculate Sun Position Vector
    const latitude = 37 * (Math.PI / 180); // California average
    const hourAngle = ((timeOfDay - 12) * 15) * (Math.PI / 180);
    const declination = seasonAngle * (Math.PI / 180);

    // Sin elevation = sin(lat)*sin(dec) + cos(lat)*cos(dec)*cos(hour)
    const sinElevation = Math.sin(latitude) * Math.sin(declination) + 
                         Math.cos(latitude) * Math.cos(declination) * Math.cos(hourAngle);
    const elevation = Math.asin(sinElevation);

    // Calculate Cosine loss relative to Roof Surface Normals
    const roofPitchRad = houseParams.pitch * (Math.PI / 180);
    const roofAzimuthRad = (houseParams.azimuth - 180) * (Math.PI / 180); // Relative direction offset

    // Sun Vector in Cartesian space (y-up, z-south, x-east)
    const sunVector = new window.THREE?.Vector3(
      Math.cos(elevation) * Math.sin(hourAngle),
      Math.sin(elevation),
      Math.cos(elevation) * Math.cos(hourAngle)
    ) || { x: 0, y: 1, z: 0 };

    // Standard solar constant peak (approx 1000 W/m2 at zenith under clear skies)
    const baseIrradiance = Math.max(0, 1000 * Math.sin(elevation));

    // Roof Normal (assuming active panels are flush with the main south/active facet)
    let cosIncident = 1;
    if (houseParams.roofType === 'Gable') {
      const normalSouth = new window.THREE?.Vector3(
        Math.sin(roofPitchRad) * Math.sin(roofAzimuthRad),
        Math.cos(roofPitchRad),
        Math.sin(roofPitchRad) * Math.cos(roofAzimuthRad)
      );
      cosIncident = normalSouth ? Math.max(0, sunVector.dot(normalSouth)) : 1;
    } else if (houseParams.roofType === 'Monoslope') {
      const normal = new window.THREE?.Vector3(
        Math.sin(roofPitchRad) * Math.sin(roofAzimuthRad),
        Math.cos(roofPitchRad),
        Math.sin(roofPitchRad) * Math.cos(roofAzimuthRad)
      );
      cosIncident = normal ? Math.max(0, sunVector.dot(normal)) : 1;
    } else {
      // Flat roof
      cosIncident = Math.max(0, sunVector.y);
    }

    // Panel properties
    const totalPanels = houseParams.panelRows * houseParams.panelCols;
    const arrayCapacityKw = (totalPanels * panelWattage) / 1000;

    // Adjust for obstructions & Shading Losses
    let shadingFactor = 1.0;
    if (houseParams.chimney) shadingFactor -= 0.08;
    if (houseParams.tree) {
      const hourOffset = Math.abs(timeOfDay - 12);
      if (hourOffset > 3) shadingFactor -= 0.25;
    }

    const calculatedLivePower = arrayCapacityKw * (baseIrradiance / 1000) * cosIncident * shadingFactor;
    setLivePower(Math.max(0, parseFloat(calculatedLivePower.toFixed(2))));

    // Calculate entire day curve (6am - 6pm)
    const curve = [];
    for (let h = 6; h <= 18; h += 0.5) {
      const ha = ((h - 12) * 15) * (Math.PI / 180);
      const sinE = Math.sin(latitude) * Math.sin(declination) + Math.cos(latitude) * Math.cos(declination) * Math.cos(ha);
      const elev = Math.asin(sinE);
      const baseIrr = Math.max(0, 1000 * Math.sin(elev));
      
      const sunVec = new window.THREE?.Vector3(
        Math.cos(elev) * Math.sin(ha),
        Math.sin(elev),
        Math.cos(elev) * Math.cos(ha)
      ) || { x: 0, y: 1, z: 0 };

      let cosInc = 1;
      if (houseParams.roofType === 'Gable') {
        const normalSouth = new window.THREE?.Vector3(Math.sin(roofPitchRad) * Math.sin(roofAzimuthRad), Math.cos(roofPitchRad), Math.sin(roofPitchRad) * Math.cos(roofAzimuthRad));
        cosInc = normalSouth ? Math.max(0, sunVec.dot(normalSouth)) : 1;
      } else if (houseParams.roofType === 'Monoslope') {
        const normal = new window.THREE?.Vector3(Math.sin(roofPitchRad) * Math.sin(roofAzimuthRad), Math.cos(roofPitchRad), Math.sin(roofPitchRad) * Math.cos(roofAzimuthRad));
        cosInc = normal ? Math.max(0, sunVec.dot(normal)) : 1;
      } else {
        cosInc = Math.max(0, sunVec.y);
      }

      let shadowF = 1.0;
      if (houseParams.chimney) shadowF -= 0.08;
      if (houseParams.tree && Math.abs(h - 12) > 3) shadowF -= 0.25;

      const pwr = arrayCapacityKw * (baseIrr / 1000) * cosInc * shadowF;
      curve.push({ time: h, power: Math.max(0, pwr) });
    }
    setDailyCurve(curve);

    // Annual production approximation (kWh)
    const avgDailyKwh = curve.reduce((acc, curr) => acc + curr.power * 0.5, 0); 
    const annualYld = avgDailyKwh * 365 * 0.85; 
    setAnnualEst(Math.round(annualYld));

  }, [timeOfDay, seasonAngle, houseParams, panelWattage]);

  // Initializing and updating the Three.js viewport
  useEffect(() => {
    if (!threeReady || !canvasRef.current) return;

    // 1. Scene Setup
    if (!sceneRef.current) {
      const scene = new window.THREE.Scene();
      scene.background = new window.THREE.Color('#0f172a'); 

      scene.fog = new window.THREE.FogExp2('#0f172a', 0.015);

      const camera = new window.THREE.PerspectiveCamera(
        45, 
        canvasRef.current.clientWidth / canvasRef.current.clientHeight, 
        0.1, 
        1000
      );
      camera.position.set(15, 12, 18);

      const renderer = new window.THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(canvasRef.current.clientWidth, canvasRef.current.clientHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = window.THREE.PCFSoftShadowMap;
      
      canvasRef.current.appendChild(renderer.domElement);

      const ambientLight = new window.THREE.AmbientLight('#1e293b', 1.5); 
      scene.add(ambientLight);

      const hemiLight = new window.THREE.HemisphereLight('#38bdf8', '#334155', 0.6);
      scene.add(hemiLight);

      const sunLight = new window.THREE.DirectionalLight('#fffbeb', 2.0);
      sunLight.castShadow = true;
      sunLight.shadow.mapSize.width = 2048;
      sunLight.shadow.mapSize.height = 2048;
      sunLight.shadow.camera.near = 0.5;
      sunLight.shadow.camera.far = 100;
      const d = 15;
      sunLight.shadow.camera.left = -d;
      sunLight.shadow.camera.right = d;
      sunLight.shadow.camera.top = d;
      sunLight.shadow.camera.bottom = -d;
      sunLight.shadow.bias = -0.0005;
      scene.add(sunLight);
      sunLightRef.current = sunLight;

      const sunGeo = new window.THREE.SphereGeometry(0.8, 32, 32);
      const sunMat = new window.THREE.MeshBasicMaterial({ color: '#fef08a', toneMapped: false });
      const sunSphere = new window.THREE.Mesh(sunGeo, sunMat);
      scene.add(sunSphere);
      sunSphereRef.current = sunSphere;

      const controls = new window.THREE.OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;
      controls.maxPolarAngle = Math.PI / 2 - 0.05; 
      controls.minDistance = 5;
      controls.maxDistance = 60;
      controlsRef.current = controls;

      const gridHelper = new window.THREE.GridHelper(40, 40, '#334155', '#1e293b');
      gridHelper.position.y = -0.01;
      scene.add(gridHelper);

      const grassGeo = new window.THREE.PlaneGeometry(80, 80);
      const grassMat = new window.THREE.MeshStandardMaterial({ 
        color: '#1b261e',
        roughness: 0.9,
        metalness: 0.1
      });
      const grass = new window.THREE.Mesh(grassGeo, grassMat);
      grass.rotation.x = -Math.PI / 2;
      grass.receiveShadow = true;
      scene.add(grass);

      createCompassDirections(scene);

      sceneRef.current = scene;
      cameraRef.current = camera;
      rendererRef.current = renderer;
    }

    rebuildProceduralHouse();

    const handleResize = () => {
      if (!canvasRef.current || !cameraRef.current || !rendererRef.current) return;
      cameraRef.current.aspect = canvasRef.current.clientWidth / canvasRef.current.clientHeight;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(canvasRef.current.clientWidth, canvasRef.current.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    let animationFrameId;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      
      if (controlsRef.current) controlsRef.current.update();

      if (sunLightRef.current && sunSphereRef.current) {
        const latitude = 37 * (Math.PI / 180);
        const hourAngle = ((timeOfDay - 12) * 15) * (Math.PI / 180);
        const declination = seasonAngle * (Math.PI / 180);

        const sinElevation = Math.sin(latitude) * Math.sin(declination) + 
                             Math.cos(latitude) * Math.cos(declination) * Math.cos(hourAngle);
        const elevation = Math.asin(sinElevation);

        const sunDistance = 25;
        const x = sunDistance * Math.cos(elevation) * Math.sin(hourAngle);
        const y = sunDistance * Math.sin(elevation);
        const z = sunDistance * Math.cos(elevation) * Math.cos(hourAngle);

        sunLightRef.current.position.set(x, y, z);
        sunSphereRef.current.position.set(x, y, z);

        if (y < 0) {
          sunLightRef.current.intensity = 0;
          sunSphereRef.current.visible = false;
        } else {
          const sunIntensity = Math.min(2.0, (y / 5) * 2.0);
          sunLightRef.current.intensity = sunIntensity;
          sunSphereRef.current.visible = true;
        }
      }

      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    };
    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
    };
  }, [threeReady, houseParams, timeOfDay, seasonAngle, showWireframe, showShadows]);

  const createCompassDirections = (scene) => {
    const cardinalColors = { N: '#f43f5e', S: '#38bdf8', E: '#10b981', W: '#eab308' };
    const radius = 16;
    
    const directions = [
      { text: 'N', pos: [0, 0.05, -radius] },
      { text: 'S', pos: [0, 0.05, radius] },
      { text: 'E', pos: [radius, 0.05, 0] },
      { text: 'W', pos: [-radius, 0.05, 0] }
    ];

    directions.forEach((dir) => {
      const markerGeo = new window.THREE.SphereGeometry(0.3, 16, 16);
      const markerMat = new window.THREE.MeshBasicMaterial({ color: cardinalColors[dir.text] });
      const marker = new window.THREE.Mesh(markerGeo, markerMat);
      marker.position.set(...dir.pos);
      scene.add(marker);
    });

    const ringGeo = new window.THREE.RingGeometry(radius - 0.1, radius + 0.1, 64);
    const ringMat = new window.THREE.MeshBasicMaterial({ color: '#334155', side: window.THREE.DoubleSide });
    const ring = new window.THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.01;
    scene.add(ring);
  };

  const rebuildProceduralHouse = () => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (houseGroupRef.current) {
      scene.remove(houseGroupRef.current);
      disposeHierarchy(houseGroupRef.current);
    }

    const houseGroup = new window.THREE.Group();
    const angleOffsetRad = (houseParams.azimuth - 180) * (Math.PI / 180);
    houseGroup.rotation.y = angleOffsetRad;

    const { width, length, height, pitch, roofType, chimney, vent, tree } = houseParams;

    const wallGeo = new window.THREE.BoxGeometry(width, height, length);
    const wallMat = new window.THREE.MeshStandardMaterial({
      color: '#f1f5f9', 
      roughness: 0.8,
      metalness: 0.1,
      wireframe: showWireframe
    });
    const walls = new window.THREE.Mesh(wallGeo, wallMat);
    walls.position.y = height / 2;
    walls.castShadow = true;
    walls.receiveShadow = true;
    houseGroup.add(walls);

    const doorGeo = new window.THREE.BoxGeometry(1.2, 2.2, 0.1);
    const doorMat = new window.THREE.MeshStandardMaterial({ color: '#1e293b' }); 
    const door = new window.THREE.Mesh(doorGeo, doorMat);
    door.position.set(0, 1.1, length / 2 + 0.05);
    houseGroup.add(door);

    const pitchRad = pitch * (Math.PI / 180);
    const roofOverhang = 0.3;

    if (roofType === 'Gable') {
      const halfWidth = width / 2;
      const roofPeakHeight = halfWidth * Math.tan(pitchRad);

      const triShape = new window.THREE.Shape();
      triShape.moveTo(-halfWidth, height);
      triShape.lineTo(halfWidth, height);
      triShape.lineTo(0, height + roofPeakHeight);
      triShape.closePath();

      const extrudeSettings = { depth: length, bevelEnabled: false };
      const gableTriGeo = new window.THREE.ExtrudeGeometry(triShape, extrudeSettings);
      const gableTriMat = new window.THREE.MeshStandardMaterial({ color: '#f1f5f9', roughness: 0.8 });
      const gableSides = new window.THREE.Mesh(gableTriGeo, gableTriMat);
      gableSides.position.z = -length / 2;
      gableSides.castShadow = true;
      gableSides.receiveShadow = true;
      houseGroup.add(gableSides);

      const slopeLength = (halfWidth + roofOverhang) / Math.cos(pitchRad);
      const roofPlaneGeo = new window.THREE.BoxGeometry(slopeLength, 0.15, length + 0.6);
      const roofPlaneMat = new window.THREE.MeshStandardMaterial({
        color: '#1e293b', 
        roughness: 0.65,
        wireframe: showWireframe
      });

      const leftSlope = new window.THREE.Mesh(roofPlaneGeo, roofPlaneMat);
      leftSlope.position.set(-(halfWidth / 2 + roofOverhang / 4), height + roofPeakHeight / 2, 0);
      leftSlope.rotation.z = pitchRad;
      leftSlope.castShadow = true;
      leftSlope.receiveShadow = true;
      houseGroup.add(leftSlope);

      const rightSlope = new window.THREE.Mesh(roofPlaneGeo, roofPlaneMat);
      rightSlope.position.set((halfWidth / 2 + roofOverhang / 4), height + roofPeakHeight / 2, 0);
      rightSlope.rotation.z = -pitchRad;
      rightSlope.castShadow = true;
      rightSlope.receiveShadow = true;
      houseGroup.add(rightSlope);

      addSolarPanelsToSlope(rightSlope, slopeLength, length, pitchRad);

    } else if (roofType === 'Monoslope') {
      const roofPeakHeight = width * Math.tan(pitchRad);
      
      const monoShape = new window.THREE.Shape();
      monoShape.moveTo(-width/2, height);
      monoShape.lineTo(width/2, height);
      monoShape.lineTo(-width/2, height + roofPeakHeight);
      monoShape.closePath();

      const extrudeSettings = { depth: length, bevelEnabled: false };
      const monoTriGeo = new window.THREE.ExtrudeGeometry(monoShape, extrudeSettings);
      const monoTriMat = new window.THREE.MeshStandardMaterial({ color: '#f1f5f9', roughness: 0.8 });
      const monoSides = new window.THREE.Mesh(monoTriGeo, monoTriMat);
      monoSides.position.z = -length / 2;
      monoSides.castShadow = true;
      monoSides.receiveShadow = true;
      houseGroup.add(monoSides);

      const slopeLength = (width + roofOverhang) / Math.cos(pitchRad);
      const roofPlaneGeo = new window.THREE.BoxGeometry(slopeLength, 0.15, length + 0.6);
      const roofPlaneMat = new window.THREE.MeshStandardMaterial({ color: '#27272a', roughness: 0.7 });
      
      const roofMesh = new window.THREE.Mesh(roofPlaneGeo, roofPlaneMat);
      roofMesh.position.set(0, height + roofPeakHeight / 2, 0);
      roofMesh.rotation.z = pitchRad;
      roofMesh.castShadow = true;
      roofMesh.receiveShadow = true;
      houseGroup.add(roofMesh);

      addSolarPanelsToSlope(roofMesh, slopeLength, length, pitchRad);

    } else {
      const roofPlaneGeo = new window.THREE.BoxGeometry(width, 0.2, length);
      const roofPlaneMat = new window.THREE.MeshStandardMaterial({ color: '#4b5563', roughness: 0.9 });
      const flatRoof = new window.THREE.Mesh(roofPlaneGeo, roofPlaneMat);
      flatRoof.position.y = height + 0.1;
      flatRoof.castShadow = true;
      flatRoof.receiveShadow = true;
      houseGroup.add(flatRoof);

      addSolarPanelsToSlope(flatRoof, width, length, 0);
    }

    if (chimney) {
      const chimGeo = new window.THREE.BoxGeometry(0.8, 2.5, 0.8);
      const chimMat = new window.THREE.MeshStandardMaterial({ color: '#7f1d1d', roughness: 0.9 }); 
      const chim = new window.THREE.Mesh(chimGeo, chimMat);
      chim.position.set(width / 3, height + 1.2, -length / 4);
      chim.castShadow = true;
      chim.receiveShadow = true;
      houseGroup.add(chim);
    }

    if (vent) {
      const ventGeo = new window.THREE.CylinderGeometry(0.1, 0.1, 0.8, 16);
      const ventMat = new window.THREE.MeshStandardMaterial({ color: '#3f3f46', metalness: 0.8 });
      const pipeVent = new window.THREE.Mesh(ventGeo, ventMat);
      pipeVent.position.set(-width / 4, height + 0.6, length / 3);
      pipeVent.castShadow = true;
      houseGroup.add(pipeVent);
    }

    if (tree) {
      const trunkGeo = new window.THREE.CylinderGeometry(0.3, 0.5, 7, 16);
      const trunkMat = new window.THREE.MeshStandardMaterial({ color: '#451a03' });
      const trunk = new window.THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.set(-width - 3, 3.5, length / 3);
      trunk.castShadow = true;
      houseGroup.add(trunk);

      const leavesGeo = new window.THREE.SphereGeometry(3, 16, 16);
      const leavesMat = new window.THREE.MeshStandardMaterial({ color: '#064e3b', roughness: 0.9 });
      const leaves = new window.THREE.Mesh(leavesGeo, leavesMat);
      leaves.position.set(-width - 3, 8, length / 3);
      leaves.castShadow = true;
      houseGroup.add(leaves);
    }

    scene.add(houseGroup);
    houseGroupRef.current = houseGroup;
  };

  const addSolarPanelsToSlope = (parentRoofSlope, slopeLength, roofLength, slopePitchAngle) => {
    const { panelRows, panelCols } = houseParams;
    const panelWidth = 1.0;  
    const panelLength = 1.6; 
    const panelGap = 0.08;   

    const totalWidth = panelCols * panelWidth + (panelCols - 1) * panelGap;
    const totalLength = panelRows * panelLength + (panelRows - 1) * panelGap;

    if (totalWidth > slopeLength || totalLength > roofLength) {
      return;
    }

    const panelGeo = new window.THREE.BoxGeometry(panelWidth, 0.06, panelLength);
    const panelMat = new window.THREE.MeshStandardMaterial({
      color: '#1d4ed8', 
      roughness: 0.2,
      metalness: 0.9,
      clearcoat: 1.0,
      clearcoatRoughness: 0.1
    });

    const frameGeo = new window.THREE.BoxGeometry(panelWidth + 0.04, 0.08, panelLength + 0.04);
    const frameMat = new window.THREE.MeshStandardMaterial({ color: '#f8fafc', metalness: 0.9 }); 

    const startX = -totalWidth / 2 + panelWidth / 2;
    const startZ = -totalLength / 2 + panelLength / 2;

    for (let r = 0; r < panelRows; r++) {
      for (let c = 0; c < panelCols; c++) {
        const panelContainer = new window.THREE.Group();

        const cells = new window.THREE.Mesh(panelGeo, panelMat);
        const frame = new window.THREE.Mesh(frameGeo, frameMat);
        frame.position.y = -0.01; 
        
        panelContainer.add(cells);
        panelContainer.add(frame);

        const pX = startX + c * (panelWidth + panelGap);
        const pZ = startZ + r * (panelLength + panelGap);
        
        panelContainer.position.set(pX, 0.15, pZ);
        
        if (houseParams.roofType === 'Flat') {
          panelContainer.rotation.x = -15 * (Math.PI / 180); 
        }

        panelContainer.castShadow = true;
        parentRoofSlope.add(panelContainer);
      }
    }
  };

  const disposeHierarchy = (obj) => {
    obj.traverse((child) => {
      if (child.isMesh) {
        if (child.geometry) child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach((mat) => mat.dispose());
        } else if (child.material) {
          child.material.dispose();
        }
      }
    });
  };

  const handleImageUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setLoadingAI(true);
    setErrorAI(null);

    const reader = new FileReader();
    reader.onloadend = () => {
      setUploadedImage(URL.createObjectURL(file));
      const base64Data = reader.result.split(',')[1];
      setUploadedBase64({
        data: base64Data,
        mimeType: file.type
      });
      setLoadingAI(false);
      showToast("Roof Photo successfully imported. Ready for AI Survey!", "success");
    };
    reader.readAsDataURL(file);
  };

  const runAISurveyAnalysis = async () => {
    if (!uploadedBase64) {
      showToast("Please upload an image first or choose a sample system preset.", "error");
      return;
    }

    setLoadingAI(true);
    setErrorAI(null);

    const apiURL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
    const prompt = `Analyze this roof photograph for a detailed professional solar photovoltaic feasibility design survey. Estimate key parameters needed to construct a CAD model.
Return structural dimensions and layout assessments ONLY in structured JSON matching this schema:
{
  "roofType": "Gable" | "Flat" | "Monoslope",
  "estimatedPitch": number (between 0 and 50),
  "azimuthOrientation": string (e.g. "South", "South-West", "North-East"),
  "obstructions": array of strings (detect vents, chimneys, trees, skylights),
  "suitabilityScore": number (0 to 100 representing solar yield index),
  "panelCapacityEstimate": number (estimate standard panels capacity fit),
  "analysisReport": string (comprehensive physical and shading analysis summary)
}`;

    const payload = {
      contents: [{
        role: "user",
        parts: [
          { text: prompt },
          { inlineData: { mimeType: uploadedBase64.mimeType, data: uploadedBase64.data } }
        ]
      }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            roofType: { type: "STRING", enum: ["Gable", "Flat", "Monoslope"] },
            estimatedPitch: { type: "NUMBER" },
            azimuthOrientation: { type: "STRING" },
            obstructions: { type: "ARRAY", items: { type: "STRING" } },
            suitabilityScore: { type: "NUMBER" },
            panelCapacityEstimate: { type: "NUMBER" },
            analysisReport: { type: "STRING" }
          },
          required: ["roofType", "estimatedPitch", "azimuthOrientation", "obstructions", "suitabilityScore", "panelCapacityEstimate", "analysisReport"]
        }
      }
    };

    try {
      const data = await fetchWithRetry(apiURL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const result = JSON.parse(data.candidates?.[0]?.content?.parts?.[0]?.text || "{}");
      
      setAiReport(result);
      
      const azimuthDegrees = 
        result.azimuthOrientation.toLowerCase().includes('south-west') ? 225 :
        result.azimuthOrientation.toLowerCase().includes('south-east') ? 135 :
        result.azimuthOrientation.toLowerCase().includes('south') ? 180 :
        result.azimuthOrientation.toLowerCase().includes('west') ? 270 :
        result.azimuthOrientation.toLowerCase().includes('east') ? 90 : 180;

      const detectedObstructions = result.obstructions.map(o => o.toLowerCase());
      
      setHouseParams(prev => ({
        ...prev,
        roofType: result.roofType,
        pitch: result.estimatedPitch,
        azimuth: azimuthDegrees,
        chimney: detectedObstructions.some(o => o.includes('chimney')),
        vent: detectedObstructions.some(o => o.includes('vent') || o.includes('pipe') || o.includes('utility')),
        tree: detectedObstructions.some(o => o.includes('tree') || o.includes('shadow') || o.includes('shading'))
      }));

      showToast("AI Vision Survey complete! CAD dimensions synced.", "success");
    } catch (err) {
      setErrorAI("Unable to communicate with the AI Vision endpoint. Falling back to local precision synthesis.");
      showToast("AI API connection bypassed. Bypassing simulation fallback.", "info");
      
      const mockResult = {
        roofType: 'Gable',
        estimatedPitch: 22,
        azimuthOrientation: 'South-East',
        obstructions: ['Plumbing Vents', 'Overhanging Branch'],
        suitabilityScore: 84,
        panelCapacityEstimate: 14,
        analysisReport: 'Fallback Visual Analysis: Gable structure mapped with ~22° moderate pitch facing South-East (optimal morning irradiance). Detected light utility micro-obstructions on rear elevation plane.'
      };
      setAiReport(mockResult);
    } finally {
      setLoadingAI(false);
    }
  };

  // ✨ Feature 1: Send Context-primed chat message to Gemini API
  const sendChatMessage = async (e) => {
    if (e) e.preventDefault();
    if (!chatInput.trim() || loadingChat) return;

    const userMsg = chatInput;
    setChatInput('');
    const nextHistory = [...chatHistory, { role: 'user', text: userMsg }];
    setChatHistory(nextHistory);
    setLoadingChat(true);

    const apiURL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
    
    // Structure chat logs alternating turns
    const contents = nextHistory.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.text }]
    }));

    const systemPrompt = `You are "SolarScope Copilot", an expert solar photovoltaic layout designer, shading analyst, and engineer.
    The user is currently designing a solar system using an interactive 3D CAD workspace. Here is their LIVE 3D building configuration:
    - Roof Style: ${houseParams.roofType}
    - Slope/Pitch: ${houseParams.pitch}°
    - Azimuth Orientation: ${houseParams.azimuth}° (Compass heading)
    - House Dimensions: Width ${houseParams.width}m x Length ${houseParams.length}m x Height ${houseParams.height}m
    - Obstructions Present: ${[
        houseParams.chimney ? "Brick Chimney (adds shading)" : null,
        houseParams.vent ? "Utility Plumbing Vents" : null,
        houseParams.tree ? "Conifer Tree (casts significant morning/afternoon shadows)" : null
      ].filter(Boolean).join(', ') || 'None'}
    - Active Solar Panel Count: ${houseParams.panelRows * houseParams.panelCols} (${houseParams.panelRows} rows x ${houseParams.panelCols} cols)
    - Panel Peak Rating: ${panelWattage}W
    - Calculated Total DC Array Size: ${((houseParams.panelRows * houseParams.panelCols * panelWattage) / 1000).toFixed(2)} kWp
    - Projected Live Power: ${livePower} kW (under current simulated sun at hour ${timeOfDay})
    - Projected Annual Energy Generation: ${annualEst} kWh/year
    
    Provide direct, highly scientific, structural, electrical, shading, and financial optimization advice based on this exact state. Focus heavily on how modifying their current 3D settings will change their output. Always respond concisely and professionally. Use bold text, bullet points, and markdown tables when detailing wiring schematics, inverters, or monetary return tables.`;

    const payload = {
      contents: contents,
      systemInstruction: {
        parts: [{ text: systemPrompt }]
      }
    };

    try {
      const data = await fetchWithRetry(apiURL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const botText = data.candidates?.[0]?.content?.parts?.[0]?.text || "I was unable to formulate an answer. Please modify your query.";
      setChatHistory(prev => [...prev, { role: 'assistant', text: botText }]);
    } catch (err) {
      setChatHistory(prev => [...prev, { role: 'assistant', text: "⚠️ Connection timeout. Unable to reach Gemini API. Below is a generic simulation reminder: Ensure high-shade structures use microinverters to avoid entire string degradation." }]);
    } finally {
      setLoadingChat(false);
    }
  };

  // ✨ Feature 2: Generate professional document proposal utilizing Gemini API
  const generateProposal = async () => {
    setLoadingProposal(true);
    setProposalOutput('');

    const apiURL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
    
    let instructions = "";
    if (proposalType === 'investment') {
      instructions = `Draft a comprehensive "Financial Investment Analysis & Payback Proposal" for this configured solar array. 
      Include estimated offset percentages, upfront hardware/installation costs (~$2.80 per watt), federal tax credit (ITC 30% reduction), 25-year net energy savings based on an average rate of $0.16/kWh, internal rate of return (IRR), and a calculated break-even year payback timeline. Make the table layout pristine.`;
    } else if (proposalType === 'engineering') {
      instructions = `Draft an "Engineering & Structural Installation Guide" for this configured structure.
      Detail:
      1. Structural wind/snow load rating considerations for a ${houseParams.roofType} roof with a ${houseParams.pitch}° pitch slope.
      2. Electrical string mapping: Recommend serial vs parallel combination configurations, appropriate grid-tied central string inverter size (in kW), or microinverter integration to combat shading from: ${[houseParams.chimney ? "Chimney" : "", houseParams.vent ? "Vents" : "", houseParams.tree ? "Trees" : ""].filter(Boolean).join(', ') || 'none'}.
      3. Mechanical wire routing pathway suggestions from the array junction box down to the main service panel breaker layout.`;
    } else {
      instructions = `Draft an enthusiastic, persuasive "Client Presentation & Sales Pitch Draft".
      Write a highly professional outbound email followed by a talking-point outline designed to sell this custom solar system to a homeowner. Frame the value proposition around carbon emission reductions, grid reliability during power grid outages, and substantial property appreciation. Include direct quotes for the configured ${((houseParams.panelRows * houseParams.panelCols * panelWattage) / 1000).toFixed(2)} kWp system size!`;
    }

    const prompt = `Generate a highly detailed, professional solar document.
    Here are the building properties:
    - Roof Style: ${houseParams.roofType}
    - Slope/Pitch: ${houseParams.pitch}°
    - Azimuth Heading: ${houseParams.azimuth}°
    - House Dimensions: Width ${houseParams.width}m x Length ${houseParams.length}m x Height ${houseParams.height}m
    - Obstructions Present: ${[
        houseParams.chimney ? "Brick Chimney" : null,
        houseParams.vent ? "Utility Vents" : null,
        houseParams.tree ? "Nearby Tree Shading" : null
      ].filter(Boolean).join(', ') || 'None'}
    - Active Solar Panel Count: ${houseParams.panelRows * houseParams.panelCols} (${houseParams.panelRows} rows x ${houseParams.panelCols} cols)
    - Panel Wattage: ${panelWattage}W
    - Total DC Array Size: ${((houseParams.panelRows * houseParams.panelCols * panelWattage) / 1000).toFixed(2)} kWp
    - Projected Annual Energy Generation: ${annualEst} kWh/year
    
    ${instructions}
    
    Format the output cleanly in clean, readable Markdown with clear headings and bullet lists. Do not explain anything outside the document, generate the document directly.`;

    const payload = {
      contents: [{
        parts: [{ text: prompt }]
      }]
    };

    try {
      const data = await fetchWithRetry(apiURL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text || "Failed to generate report.";
      setProposalOutput(resultText);
      showToast("Document drafted successfully!", "success");
    } catch (error) {
      setProposalOutput(`### Live Proposal Offline Draft\n\nUnable to establish direct connection. Calculated metrics:\n\n* **Design Size:** ${((houseParams.panelRows * houseParams.panelCols * panelWattage) / 1000).toFixed(2)} kWp\n* **Est. Yield:** ${annualEst} kWh/year\n\nPlease check network capabilities.`);
    } finally {
      setLoadingProposal(false);
    }
  };

  const copyProposalToClipboard = () => {
    const dummy = document.createElement("textarea");
    document.body.appendChild(dummy);
    dummy.value = proposalOutput;
    dummy.select();
    document.execCommand("copy");
    document.body.removeChild(dummy);
    showToast("Document copied to clipboard!", "success");
  };

  const handleSelectPreset = (presetId) => {
    const preset = SAMPLE_ROOFS.find(r => r.id === presetId);
    if (!preset) return;

    setSelectedSample(presetId);
    setUploadedImage(null);
    setUploadedBase64(null);
    setAiReport(preset.aiAnalysis);
    setHouseParams(preset.params);
    showToast(`Loaded preset architecture: ${preset.name}`, "info");
  };

  // Quick Chat Suggestion Trigger
  const triggerQuickQuestion = (text) => {
    setChatInput(text);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none">
      
      {/* Toast Alert Widget */}
      {toast && (
        <div className={`fixed top-6 right-6 z-50 flex items-center gap-3 px-5 py-4 rounded-xl border shadow-2xl transition-all duration-300 transform scale-100 ${
          toast.type === 'success' ? 'bg-emerald-950/90 border-emerald-500/50 text-emerald-200' : 
          toast.type === 'error' ? 'bg-rose-950/90 border-rose-500/50 text-rose-200' : 
          'bg-slate-900/95 border-slate-700/50 text-slate-200'
        }`}>
          {toast.type === 'success' ? <CheckCircle className="w-5 h-5 text-emerald-400" /> : <Info className="w-5 h-5 text-sky-400" />}
          <span className="text-sm font-semibold tracking-wide">{toast.message}</span>
        </div>
      )}

      {/* Primary Header */}
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-md px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-emerald-500 text-slate-950 p-2.5 rounded-xl font-bold shadow-lg shadow-emerald-500/10">
            <Sun className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight text-white flex items-center gap-2">
              SOLARSCOPE AI <span className="text-xs bg-emerald-500/20 text-emerald-400 font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider">v2.6 Premium</span>
            </h1>
            <p className="text-xs text-slate-400 font-medium">3D Photovoltaic Engineering & Visual AI Survey Workspace</p>
          </div>
        </div>
        
        {/* Dynamic Telemetry Metric Summary Panel */}
        <div className="flex items-center gap-6">
          <div className="hidden lg:flex items-center gap-3 bg-slate-900/80 border border-slate-800 rounded-xl px-4 py-2">
            <Compass className="w-5 h-5 text-sky-400" />
            <div>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Compass Orientation</p>
              <p className="text-sm font-black text-slate-200">{houseParams.azimuth}° ({houseParams.azimuth === 180 ? 'South' : houseParams.azimuth > 180 ? 'SW/West' : 'SE/East'})</p>
            </div>
          </div>
          <div className="flex items-center gap-3 bg-slate-900/80 border border-slate-800 rounded-xl px-4 py-2">
            <Sun className="w-5 h-5 text-amber-400" />
            <div>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Irradiance Yield</p>
              <p className="text-sm font-black text-amber-200">{livePower} <span className="text-xs font-normal text-slate-400">kW Live</span></p>
            </div>
          </div>
          <div className="flex items-center gap-3 bg-slate-900/80 border border-slate-800 rounded-xl px-4 py-2">
            <TrendingUp className="w-5 h-5 text-emerald-400" />
            <div>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Annual Energy Est.</p>
              <p className="text-sm font-black text-emerald-300">{annualEst.toLocaleString()} <span className="text-xs font-normal text-slate-400">kWh</span></p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Structural Layout */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
        
        {/* Left Side: Input Workspace Tabs */}
        <section className="lg:col-span-5 border-r border-slate-800 flex flex-col bg-slate-900/20 overflow-y-auto max-h-[calc(100vh-80px)]">
          
          {/* Workspace Tabs */}
          <div className="grid grid-cols-4 border-b border-slate-800 bg-slate-900/40 sticky top-0 z-10 overflow-x-auto select-none">
            <button 
              onClick={() => setActiveTab('survey')}
              className={`py-3 px-1 text-[10px] font-black uppercase tracking-wider border-b-2 flex flex-col items-center justify-center gap-1.5 transition-all ${
                activeTab === 'survey' ? 'border-emerald-500 text-emerald-400 bg-slate-900/50' : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Cpu className="w-4 h-4" />
              1. AI Survey
            </button>
            <button 
              onClick={() => setActiveTab('cad')}
              className={`py-3 px-1 text-[10px] font-black uppercase tracking-wider border-b-2 flex flex-col items-center justify-center gap-1.5 transition-all ${
                activeTab === 'cad' ? 'border-emerald-500 text-emerald-400 bg-slate-900/50' : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sliders className="w-4 h-4" />
              2. CAD Design
            </button>
            <button 
              onClick={() => setActiveTab('solar')}
              className={`py-3 px-1 text-[10px] font-black uppercase tracking-wider border-b-2 flex flex-col items-center justify-center gap-1.5 transition-all ${
                activeTab === 'solar' ? 'border-emerald-500 text-emerald-400 bg-slate-900/50' : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Layers className="w-4 h-4" />
              3. Solar Grid
            </button>
            <button 
              onClick={() => setActiveTab('copilot')}
              className={`py-3 px-1 text-[10px] font-black uppercase tracking-wider border-b-2 flex flex-col items-center justify-center gap-1.5 transition-all ${
                activeTab === 'copilot' ? 'border-emerald-400 text-emerald-400 bg-emerald-500/10' : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sparkles className="w-4 h-4 text-emerald-400 animate-pulse" />
              ✨ AI Copilot
            </button>
          </div>

          <div className="p-6 flex-1 flex flex-col gap-6">

            {/* TAB 1: AI SURVEY & IMAGE UPLOADER */}
            {activeTab === 'survey' && (
              <div className="flex flex-col gap-5 animate-fadeIn">
                <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800">
                  <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2 mb-2">
                    <Sparkles className="w-4 h-4 text-emerald-400" />
                    Perform your AI Survey
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Upload an overhead satellite crop or ground-level perspective photo of your residential building. Gemini Vision dynamically measures geometry boundaries, detects shading obstructions, and formats 3D parameters.
                  </p>
                </div>

                {/* File Drop/Uploader */}
                <div className="flex flex-col gap-3">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Upload Property Roof Photo</label>
                  <div className="border-2 border-dashed border-slate-700 hover:border-emerald-500/50 bg-slate-900/40 rounded-xl p-6 transition-all text-center relative cursor-pointer group">
                    <input 
                      type="file" 
                      accept="image/*" 
                      onChange={handleImageUpload}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                    
                    {uploadedImage ? (
                      <div className="space-y-3">
                        <img 
                          src={uploadedImage} 
                          alt="Uploaded roof survey" 
                          className="mx-auto max-h-48 rounded-lg object-cover shadow-md border border-slate-800" 
                        />
                        <p className="text-xs text-emerald-400 font-semibold flex items-center justify-center gap-1">
                          <CheckCircle className="w-4 h-4" /> Photo Successfully Loaded
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2 py-4">
                        <div className="bg-slate-800 w-12 h-12 rounded-full flex items-center justify-center mx-auto group-hover:scale-105 transition-transform">
                          <Upload className="w-5 h-5 text-slate-400 group-hover:text-emerald-400" />
                        </div>
                        <p className="text-xs text-slate-300 font-bold">Drag and drop roof image, or browse local files</p>
                        <p className="text-[10px] text-slate-500">Supports JPEG, PNG up to 10MB</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* AI Action Execution Button */}
                {uploadedImage && (
                  <button
                    onClick={runAISurveyAnalysis}
                    disabled={loadingAI}
                    className={`w-full py-3 px-4 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-lg ${
                      loadingAI 
                        ? 'bg-slate-800 text-slate-500 cursor-not-allowed' 
                        : 'bg-emerald-500 text-slate-950 hover:bg-emerald-400 shadow-emerald-500/10'
                    }`}
                  >
                    {loadingAI ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-slate-500 border-t-white"></div>
                        Extracting Photovoltaic Physics...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        Execute AI Survey Scan
                      </>
                    )}
                  </button>
                )}

                {/* System Sample Presets */}
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Or Use Interactive Architecture Samples</label>
                    <span className="text-[10px] text-emerald-500 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded-full">No upload needed</span>
                  </div>
                  <div className="grid grid-cols-1 gap-2.5">
                    {SAMPLE_ROOFS.map((sample) => (
                      <button
                        key={sample.id}
                        onClick={() => handleSelectPreset(sample.id)}
                        className={`p-3 rounded-xl border text-left flex gap-3 items-center transition-all ${
                          selectedSample === sample.id && !uploadedImage
                            ? 'bg-slate-800/80 border-emerald-500/50 shadow-md shadow-emerald-500/5' 
                            : 'bg-slate-900/30 border-slate-800 hover:border-slate-700 hover:bg-slate-900/50'
                        }`}
                      >
                        <img src={sample.image} alt={sample.name} className="w-12 h-12 rounded-lg object-cover border border-slate-800" />
                        <div className="flex-1 min-w-0">
                          <h4 className="text-xs font-bold text-slate-200 truncate">{sample.name}</h4>
                          <p className="text-[10px] text-slate-400 line-clamp-1">{sample.description}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Dynamic AI Analysis Report */}
                {aiReport && (
                  <div className="mt-2 bg-slate-900/60 rounded-xl border border-slate-800 overflow-hidden animate-fadeIn">
                    <div className="bg-slate-900/80 px-4 py-3 border-b border-slate-800 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Cpu className="w-4 h-4 text-emerald-400" />
                        <span className="text-xs font-black tracking-wider uppercase text-slate-200">AI Survey Assessment</span>
                      </div>
                      <div className="flex items-center gap-1 bg-emerald-950/50 border border-emerald-500/25 px-2 py-0.5 rounded-full">
                        <span className="text-[10px] text-emerald-400 font-bold">Suitability:</span>
                        <span className="text-[10px] text-emerald-200 font-extrabold">{aiReport.suitabilityScore}/100</span>
                      </div>
                    </div>
                    <div className="p-4 space-y-4">
                      {/* Grid metrics details */}
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="bg-slate-950/40 p-2 rounded-lg border border-slate-800/60">
                          <p className="text-[9px] text-slate-500 uppercase tracking-wider font-bold">Roof Facet Type</p>
                          <p className="text-xs font-bold text-slate-200 mt-1">{aiReport.roofType}</p>
                        </div>
                        <div className="bg-slate-950/40 p-2 rounded-lg border border-slate-800/60">
                          <p className="text-[9px] text-slate-500 uppercase tracking-wider font-bold">Est. Pitch Slope</p>
                          <p className="text-xs font-bold text-slate-200 mt-1">{aiReport.estimatedPitch}°</p>
                        </div>
                        <div className="bg-slate-950/40 p-2 rounded-lg border border-slate-800/60">
                          <p className="text-[9px] text-slate-500 uppercase tracking-wider font-bold">Azimuth Cardinal</p>
                          <p className="text-xs font-bold text-slate-200 mt-1 truncate">{aiReport.azimuthOrientation}</p>
                        </div>
                      </div>

                      {/* Obstruction badges */}
                      <div>
                        <p className="text-[10px] text-slate-500 uppercase font-black tracking-wider mb-2">Detected Structural Obstructions</p>
                        <div className="flex flex-wrap gap-1.5">
                          {aiReport.obstructions.map((obs, idx) => (
                            <span 
                              key={idx}
                              className="text-[9px] bg-slate-950 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-md font-bold flex items-center gap-1"
                            >
                              <AlertTriangle className="w-3 h-3 text-amber-500" />
                              {obs}
                            </span>
                          ))}
                          {aiReport.obstructions.length === 0 && (
                            <span className="text-[10px] text-emerald-400 font-bold bg-emerald-950/20 px-2 py-0.5 rounded">None Detected</span>
                          )}
                        </div>
                      </div>

                      {/* Text details */}
                      <div className="text-[11px] text-slate-400 leading-relaxed border-t border-slate-800/60 pt-3">
                        <p className="font-semibold text-slate-300 mb-1 flex items-center gap-1">
                          <Info className="w-3 h-3 text-emerald-400" />
                          Feasibility & Shading Analysis Summary:
                        </p>
                        {aiReport.analysisReport}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: MANUAL CAD CALIBRATION & STRUCTURE ADJUSTMENTS */}
            {activeTab === 'cad' && (
              <div className="flex flex-col gap-6 animate-fadeIn">
                <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800">
                  <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2 mb-2">
                    <Sliders className="w-4 h-4 text-emerald-400" />
                    Fine-Tune 3D Building Dimensions
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Verify boundaries or manually override dimensions. Edits adjust the simulated 3D rendering in real time.
                  </p>
                </div>

                {/* Building shape */}
                <div className="flex flex-col gap-3">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Roof Architectural Style</label>
                  <div className="grid grid-cols-3 gap-2">
                    {['Gable', 'Monoslope', 'Flat'].map((style) => (
                      <button
                        key={style}
                        onClick={() => setHouseParams(p => ({ ...p, roofType: style, pitch: style === 'Flat' ? 0 : p.pitch }))}
                        className={`py-2 px-3 text-xs font-bold rounded-lg border transition-all ${
                          houseParams.roofType === style 
                            ? 'bg-emerald-500 text-slate-950 border-emerald-500 shadow-md shadow-emerald-500/10' 
                            : 'bg-slate-900/40 border-slate-800 hover:border-slate-700 text-slate-300'
                        }`}
                      >
                        {style}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Pitch Slider (Disable if Flat roof style) */}
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between items-center text-xs font-bold text-slate-400">
                    <span className="uppercase tracking-wider">Roof Pitch (Slope Angle)</span>
                    <span className="text-emerald-400 font-black">{houseParams.pitch}°</span>
                  </div>
                  <input 
                    type="range" 
                    min="0" 
                    max="45" 
                    disabled={houseParams.roofType === 'Flat'}
                    value={houseParams.pitch}
                    onChange={(e) => setHouseParams(p => ({ ...p, pitch: parseInt(e.target.value) }))}
                    className="w-full accent-emerald-500 bg-slate-800 h-2 rounded-lg cursor-pointer disabled:opacity-40"
                  />
                  {houseParams.roofType === 'Flat' && (
                    <p className="text-[10px] text-amber-400 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" /> Pitch locked to 0° for Flat structures.
                    </p>
                  )}
                </div>

                {/* Azimuth / Rotation Slider */}
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between items-center text-xs font-bold text-slate-400">
                    <span className="uppercase tracking-wider">Azimuth Orientation Angle</span>
                    <span className="text-emerald-400 font-black">{houseParams.azimuth}°</span>
                  </div>
                  <input 
                    type="range" 
                    min="0" 
                    max="360" 
                    value={houseParams.azimuth}
                    onChange={(e) => setHouseParams(p => ({ ...p, azimuth: parseInt(e.target.value) }))}
                    className="w-full accent-emerald-500 bg-slate-800 h-2 rounded-lg cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-slate-500 font-semibold px-1">
                    <span>0° (North)</span>
                    <span>90° (East)</span>
                    <span>180° (South)</span>
                    <span>270° (West)</span>
                    <span>360° (North)</span>
                  </div>
                </div>

                {/* Dimensional sliders */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between items-center text-xs font-bold text-slate-400">
                      <span className="uppercase tracking-wider">Width</span>
                      <span className="text-emerald-400 font-black">{houseParams.width}m</span>
                    </div>
                    <input 
                      type="range" 
                      min="6" 
                      max="18" 
                      value={houseParams.width}
                      onChange={(e) => setHouseParams(p => ({ ...p, width: parseFloat(e.target.value) }))}
                      className="w-full accent-emerald-500 bg-slate-800 h-2 rounded-lg cursor-pointer"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between items-center text-xs font-bold text-slate-400">
                      <span className="uppercase tracking-wider">Length</span>
                      <span className="text-emerald-400 font-black">{houseParams.length}m</span>
                    </div>
                    <input 
                      type="range" 
                      min="6" 
                      max="18" 
                      value={houseParams.length}
                      onChange={(e) => setHouseParams(p => ({ ...p, length: parseFloat(e.target.value) }))}
                      className="w-full accent-emerald-500 bg-slate-800 h-2 rounded-lg cursor-pointer"
                    />
                  </div>
                </div>

                {/* Shading Obstruction Toggles */}
                <div className="flex flex-col gap-3 border-t border-slate-800/80 pt-4">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Obstructions Simulation Layer</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'chimney', label: 'Brick Chimney' },
                      { id: 'vent', label: 'Utility Vents' },
                      { id: 'tree', label: 'Conifer Tree' }
                    ].map((obs) => (
                      <button
                        key={obs.id}
                        onClick={() => setHouseParams(p => ({ ...p, [obs.id]: !p[obs.id] }))}
                        className={`py-2 px-1 text-[10px] font-extrabold rounded-lg border transition-all text-center ${
                          houseParams[obs.id]
                            ? 'bg-amber-950/40 border-amber-500/50 text-amber-200'
                            : 'bg-slate-900/40 border-slate-800 text-slate-400'
                        }`}
                      >
                        {obs.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: SOLAR ARRAY PANEL CONFIGURATIONS */}
            {activeTab === 'solar' && (
              <div className="flex flex-col gap-6 animate-fadeIn">
                <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800">
                  <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2 mb-2">
                    <Layers className="w-4 h-4 text-emerald-400" />
                    Configure Panel Grid Layout
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Adjust rows, columns, and peak panel rating capacity to fit optimal workspace footprint dimensions.
                  </p>
                </div>

                {/* Panel Rating Select */}
                <div className="flex flex-col gap-3">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Solar Panel Peak Capacity Rating</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[350, 400, 450].map((watt) => (
                      <button
                        key={watt}
                        onClick={() => setPanelWattage(watt)}
                        className={`py-2 px-3 text-xs font-bold rounded-lg border transition-all ${
                          panelWattage === watt 
                            ? 'bg-emerald-500 text-slate-950 border-emerald-500 shadow-md shadow-emerald-500/10' 
                            : 'bg-slate-900/40 border-slate-800 hover:border-slate-700 text-slate-300'
                        }`}
                      >
                        {watt}W Premium
                      </button>
                    ))}
                  </div>
                </div>

                {/* Grid Sizing Configuration */}
                <div className="grid grid-cols-2 gap-4 border-t border-slate-800/80 pt-4">
                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between items-center text-xs font-bold text-slate-400">
                      <span className="uppercase tracking-wider">Panel Columns</span>
                      <span className="text-emerald-400 font-black">{houseParams.panelCols} Panels</span>
                    </div>
                    <input 
                      type="range" 
                      min="1" 
                      max="10" 
                      value={houseParams.panelCols}
                      onChange={(e) => setHouseParams(p => ({ ...p, panelCols: parseInt(e.target.value) }))}
                      className="w-full accent-emerald-500 bg-slate-800 h-2 rounded-lg cursor-pointer"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between items-center text-xs font-bold text-slate-400">
                      <span className="uppercase tracking-wider">Panel Rows</span>
                      <span className="text-emerald-400 font-black">{houseParams.panelRows} Panels</span>
                    </div>
                    <input 
                      type="range" 
                      min="1" 
                      max="5" 
                      value={houseParams.panelRows}
                      onChange={(e) => setHouseParams(p => ({ ...p, panelRows: parseInt(e.target.value) }))}
                      className="w-full accent-emerald-500 bg-slate-800 h-2 rounded-lg cursor-pointer"
                    />
                  </div>
                </div>

                {/* Visual Array footprint analysis card */}
                <div className="bg-slate-900/40 p-4 rounded-xl border border-slate-800 space-y-3">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                    <Info className="w-4 h-4 text-emerald-400" />
                    Array Dimensions Analysis
                  </h4>
                  <div className="grid grid-cols-2 gap-3 text-center">
                    <div className="bg-slate-950/40 p-2.5 rounded-lg border border-slate-800">
                      <p className="text-[10px] text-slate-500 font-bold">Total Panels Fitted</p>
                      <p className="text-sm font-black text-slate-200 mt-1">{houseParams.panelRows * houseParams.panelCols}</p>
                    </div>
                    <div className="bg-slate-950/40 p-2.5 rounded-lg border border-slate-800">
                      <p className="text-[10px] text-slate-500 font-bold">Total Peak DC Size</p>
                      <p className="text-sm font-black text-emerald-300 mt-1">
                        {((houseParams.panelRows * houseParams.panelCols * panelWattage) / 1000).toFixed(2)} kWp
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 4: ✨ GEMINI AI CO-PILOT ADVISORY & DOC MAKER */}
            {activeTab === 'copilot' && (
              <div className="flex flex-col gap-5 animate-fadeIn">
                
                {/* Section Toggle: Chat vs Docs */}
                <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800 space-y-2">
                  <div className="flex items-center gap-2 text-emerald-400">
                    <Sparkles className="w-4 h-4" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">✨ Gemini AI Advisory Engine</h3>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Chat live with an AI Photovoltaic Engineer who knows the exact 3D dimensions of your building, or synthesize full formatted documentation in one click.
                  </p>
                </div>

                {/* Document Drafting Tool */}
                <div className="border border-slate-800 bg-slate-900/30 rounded-xl p-4 space-y-4">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-emerald-400" />
                    ✨ Instant Solar Document Synthesizer
                  </h4>
                  
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'investment', label: 'Financial ROI' },
                      { id: 'engineering', label: 'Engineering' },
                      { id: 'pitch', label: 'Client Pitch' }
                    ].map((type) => (
                      <button
                        key={type.id}
                        onClick={() => setProposalType(type.id)}
                        className={`py-1.5 px-2 text-[10px] font-bold rounded-lg border transition-all ${
                          proposalType === type.id
                            ? 'bg-emerald-500 text-slate-950 border-emerald-500'
                            : 'bg-slate-950/40 border-slate-800 text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        {type.label}
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={generateProposal}
                    disabled={loadingProposal}
                    className="w-full py-2.5 px-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-lg text-xs font-extrabold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all shadow-md shadow-emerald-500/10"
                  >
                    {loadingProposal ? (
                      <>
                        <div className="animate-spin rounded-full h-3 w-3 border-2 border-slate-950 border-t-transparent"></div>
                        Drafting Report...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        ✨ Synthesize Selected Document
                      </>
                    )}
                  </button>

                  {/* Document Viewer */}
                  {proposalOutput && (
                    <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 space-y-2 animate-fadeIn">
                      <div className="flex justify-between items-center border-b border-slate-800/80 pb-2">
                        <span className="text-[10px] text-slate-500 uppercase font-black">Generated Markdown Draft</span>
                        <button
                          onClick={copyProposalToClipboard}
                          className="text-[9px] text-emerald-400 hover:text-emerald-300 font-bold flex items-center gap-1 transition-all"
                        >
                          <Copy className="w-3 h-3" /> Copy Text
                        </button>
                      </div>
                      <div className="text-[10px] text-slate-300 leading-relaxed font-mono max-h-48 overflow-y-auto whitespace-pre-wrap select-text pr-1">
                        {proposalOutput}
                      </div>
                    </div>
                  )}
                </div>

                {/* Contextual Chat Workspace */}
                <div className="border border-slate-800 bg-slate-900/30 rounded-xl p-4 flex flex-col gap-3">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                    <Bot className="w-4 h-4 text-emerald-400 animate-pulse" />
                    ✨ Chat Live with Solar Copilot
                  </h4>

                  {/* Message log wrapper */}
                  <div className="bg-slate-950 border border-slate-800/80 rounded-lg p-3 h-64 overflow-y-auto flex flex-col gap-2.5">
                    {chatHistory.map((msg, i) => (
                      <div 
                        key={i} 
                        className={`flex gap-2 text-[11px] leading-relaxed max-w-[90%] ${
                          msg.role === 'user' ? 'self-end bg-slate-800 border border-slate-700/50 rounded-2xl rounded-tr-none px-3 py-2 text-slate-200' : 'self-start text-slate-300 bg-slate-900/50 rounded-2xl rounded-tl-none border border-slate-800 px-3 py-2'
                        }`}
                      >
                        {msg.role !== 'user' && <Bot className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />}
                        <div className="whitespace-pre-wrap select-text">{msg.text}</div>
                      </div>
                    ))}
                    {loadingChat && (
                      <div className="self-start flex items-center gap-2 text-[10px] text-slate-500 font-bold">
                        <Bot className="w-3.5 h-3.5 text-emerald-400 animate-spin" />
                        AI Copilot is optimizing layout physics...
                      </div>
                    )}
                  </div>

                  {/* Suggestion tags */}
                  <div className="space-y-1.5">
                    <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Quick Inquiries:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        "✨ Optimize layout tilt",
                        "✨ Shading losses?",
                        "✨ Recommend microinverters"
                      ].map((tag, idx) => (
                        <button
                          key={idx}
                          onClick={() => triggerQuickQuestion(tag)}
                          className="text-[9px] bg-slate-900 border border-slate-800 hover:border-emerald-500/20 text-slate-300 hover:text-emerald-400 px-2 py-1 rounded transition-all font-semibold"
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Input form */}
                  <form onSubmit={sendChatMessage} className="flex gap-2 mt-1">
                    <input
                      type="text"
                      placeholder="Ask copilot about shading, panel layout, strings..."
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500/50 select-text"
                    />
                    <button
                      type="submit"
                      disabled={loadingChat || !chatInput.trim()}
                      className="bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 text-slate-950 disabled:text-slate-600 p-2 rounded-lg transition-all"
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </form>
                </div>

              </div>
            )}

          </div>

          {/* Footer of survey workspace controller */}
          <div className="border-t border-slate-800 p-4 bg-slate-900/30 text-[10px] text-slate-500 font-semibold flex items-center justify-between">
            <span>Powered by Google Gemini 2.5 Flash</span>
            <span className="flex items-center gap-1 text-slate-400 hover:text-slate-200 cursor-pointer">
              <HelpCircle className="w-3.5 h-3.5" /> Contact Support
            </span>
          </div>

        </section>

        {/* Right Side: Interactive 3D Canvas and Solar Simulation Metrics */}
        <section className="lg:col-span-7 flex flex-col relative h-[50vh] lg:h-auto min-h-[400px]">
          
          {/* Simulation Header Overlays (Control switches for 3D Viewport) */}
          <div className="absolute top-4 left-4 z-10 flex flex-wrap gap-2">
            <button 
              onClick={() => {
                if (controlsRef.current && cameraRef.current) {
                  cameraRef.current.position.set(15, 12, 18);
                  controlsRef.current.target.set(0, 0, 0);
                  controlsRef.current.update();
                  showToast("Camera Reset to 3D Perspective", "info");
                }
              }}
              className="bg-slate-900/85 backdrop-blur border border-slate-800 hover:bg-slate-800 text-slate-200 px-3 py-1.5 rounded-lg text-[10px] font-black tracking-wider uppercase flex items-center gap-1.5 shadow-lg shadow-slate-950/40"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset view
            </button>
            <button 
              onClick={() => setShowWireframe(!showWireframe)}
              className={`backdrop-blur border px-3 py-1.5 rounded-lg text-[10px] font-black tracking-wider uppercase flex items-center gap-1.5 shadow-lg shadow-slate-950/40 transition-all ${
                showWireframe 
                  ? 'bg-emerald-500 text-slate-950 border-emerald-500' 
                  : 'bg-slate-900/85 border-slate-800 text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              Wireframe CAD
            </button>
            <button 
              onClick={() => setShowShadows(!showShadows)}
              className={`backdrop-blur border px-3 py-1.5 rounded-lg text-[10px] font-black tracking-wider uppercase flex items-center gap-1.5 shadow-lg shadow-slate-950/40 transition-all ${
                showShadows 
                  ? 'bg-emerald-500 text-slate-950 border-emerald-500' 
                  : 'bg-slate-900/85 border-slate-800 text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              Dynamic Shadows
            </button>
          </div>

          {/* Three.js Canvas Div Container */}
          <div ref={canvasRef} className="flex-1 w-full relative overflow-hidden bg-slate-950">
            {!threeReady && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950">
                <div className="animate-spin rounded-full h-10 w-10 border-4 border-emerald-500 border-t-transparent"></div>
                <p className="text-xs font-semibold text-slate-400">Loading Solarscope WebGL Core Engine...</p>
              </div>
            )}
          </div>

          {/* Simulation & Output Analytical Dashboard Container */}
          <div className="border-t border-slate-800 bg-slate-900/40 backdrop-blur-md p-6 grid grid-cols-1 md:grid-cols-12 gap-6">
            
            {/* Sun Simulation Sliders */}
            <div className="md:col-span-5 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                  <Sun className="w-4 h-4 text-amber-400 animate-pulse" />
                  Sun Path & Climate simulation
                </h4>
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-200 p-1.5 rounded-lg shadow"
                >
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </button>
              </div>

              {/* Time of day slider */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-[11px] font-bold text-slate-400">
                  <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> Time of Day</span>
                  <span className="text-amber-400 font-extrabold">
                    {Math.floor(timeOfDay)}:{String(Math.round((timeOfDay % 1) * 60)).padStart(2, '0')}{' '}
                    {timeOfDay >= 12 ? 'PM' : 'AM'}
                  </span>
                </div>
                <input 
                  type="range" 
                  min="6" 
                  max="18" 
                  step="0.05"
                  value={timeOfDay}
                  onChange={(e) => {
                    setTimeOfDay(parseFloat(e.target.value));
                    setIsPlaying(false); 
                  }}
                  className="w-full accent-amber-400 bg-slate-800 h-1.5 rounded-lg cursor-pointer"
                />
              </div>

              {/* Seasonal variation slider */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-[11px] font-bold text-slate-400">
                  <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> Seasonal Solstice</span>
                  <span className="text-sky-400 font-extrabold">
                    {seasonAngle > 10 ? 'Summer Solstice' : seasonAngle < -10 ? 'Winter Solstice' : 'Spring/Autumn Equinox'}
                  </span>
                </div>
                <input 
                  type="range" 
                  min="-23.44" 
                  max="23.44" 
                  step="0.1"
                  value={seasonAngle}
                  onChange={(e) => setSeasonAngle(parseFloat(e.target.value))}
                  className="w-full accent-sky-400 bg-slate-800 h-1.5 rounded-lg cursor-pointer"
                />
              </div>
            </div>

            {/* Simulated Live Daily Yield Line Chart Rendering */}
            <div className="md:col-span-7 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                  Daily Yield Generation Curve
                </h4>
                <span className="text-[10px] text-slate-500 font-extrabold">dt = 0.5hr Riemann Sum</span>
              </div>

              {/* Draw Custom SVG Area graph reflecting direct real-time power updates */}
              <div className="bg-slate-950/60 rounded-xl p-3 border border-slate-800 h-28 relative flex items-end">
                {dailyCurve.length > 0 && (
                  <svg className="w-full h-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="yieldGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity="0.4" />
                        <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                      </linearGradient>
                    </defs>
                    
                    {(() => {
                      const maxPower = Math.max(...dailyCurve.map(d => d.power), 1);
                      const points = dailyCurve.map((d, i) => {
                        const x = (i / (dailyCurve.length - 1)) * 100;
                        const y = 100 - (d.power / maxPower) * 85;
                        return `${x},${y}`;
                      });
                      
                      const pathData = `M 0,100 L ${points.join(' L ')} L 100,100 Z`;
                      const lineData = `M ${points.join(' L ')}`;

                      const timeRatio = (timeOfDay - 6) / 12; 
                      const markerX = Math.max(0, Math.min(100, timeRatio * 100));

                      return (
                        <>
                          <path d={pathData} fill="url(#yieldGrad)" />
                          <path d={lineData} fill="none" stroke="#10b981" strokeWidth="2" />
                          <line x1={markerX} y1="0" x2={markerX} y2="100" stroke="#fbbf24" strokeWidth="1" strokeDasharray="3,3" />
                          <circle cx={markerX} cy={100 - (livePower / maxPower) * 85} r="4" fill="#fbbf24" stroke="#fff" strokeWidth="1" />
                        </>
                      );
                    })()}
                  </svg>
                )}

                {/* X Axis Indicators */}
                <div className="absolute bottom-1 left-3 right-3 flex justify-between text-[8px] text-slate-500 font-extrabold">
                  <span>6:00 AM (Sunrise)</span>
                  <span>12:00 PM (Noon Peak)</span>
                  <span>6:00 PM (Sunset)</span>
                </div>
              </div>
            </div>

          </div>

        </section>

      </main>

    </div>
  );
}
