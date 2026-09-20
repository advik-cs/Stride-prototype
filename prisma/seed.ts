import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'file:./dev.db';
}

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding STRIDE database with canonical Bengaluru source-of-truth data...');

  // Clean existing data in reverse order of foreign key dependencies
  await prisma.rescueAssignment.deleteMany();
  await prisma.emergencyCondition.deleteMany();
  await prisma.emergencyRequest.deleteMany();
  await prisma.emergencyStatus.deleteMany();
  await prisma.expectedLocation.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.affectedZone.deleteMany();
  await prisma.householdMember.deleteMany();
  await prisma.household.deleteMany();
  await prisma.road.deleteMany();
  await prisma.emergencyFacility.deleteMany();
  await prisma.shelter.deleteMany();
  await prisma.priorityConfiguration.deleteMany();
  await prisma.disasterEvent.deleteMany();
  await prisma.user.deleteMany();

  // 1. Priority Configurations
  const defaultWeights = [
    { conditionType: 'FIRE', weight: 30 },
    { conditionType: 'HEAVILY_INJURED', weight: 25 },
    { conditionType: 'SERIOUSLY_UNWELL', weight: 20 },
    { conditionType: 'TRAPPED', weight: 20 },
    { conditionType: 'WATER_RISING', weight: 15 },
    { conditionType: 'NEED_RESCUE', weight: 15 },
    { conditionType: 'CHILDREN_INFANTS_PRESENT', weight: 10 },
    { conditionType: 'PHYSICALLY_DISABLED', weight: 10 },
    { conditionType: 'OTHER', weight: 5 },
  ];

  for (const w of defaultWeights) {
    await prisma.priorityConfiguration.create({ data: w });
  }

  // 2. Users (Rescuers/Authority + Citizens)
  const passwordHash = await bcrypt.hash('StrongPassword123!', 10);

  // Authority / Rescuer
  const rescuerCommander = await prisma.user.create({
    data: {
      name: 'Commander Vikram Rao',
      testIdentityNumber: 'AUTH-COMMAND-01',
      mobileNumber: '9800000001',
      password: passwordHash,
      role: 'RESCUER',
    },
  });

  const rescuerCapt = await prisma.user.create({
    data: {
      name: 'Capt. Vikram Rathore',
      testIdentityNumber: 'RES-NDRF-88210',
      mobileNumber: '9880011223',
      password: passwordHash,
      role: 'RESCUER',
    },
  });

  // Citizens for the 16 buildings
  const citizenConfigs = [
    { name: 'Ramesh Iyer', phone: '9800000011', idNum: '5432 8901 2345' },
    { name: 'Citizen Rajesh Kumar', phone: '9800000012', idNum: 'TEST-CIT-SEED-002' },
    { name: 'Citizen Meera Iyer', phone: '9800000013', idNum: 'TEST-CIT-SEED-003' },
    { name: 'Citizen Indira Naidu', phone: '9800000014', idNum: 'TEST-CIT-SEED-004' },
    { name: 'Citizen Arjun Verma', phone: '9800000015', idNum: 'TEST-CIT-SEED-005' },
    { name: 'Citizen Suresh Reddy', phone: '9800000016', idNum: 'TEST-CIT-SEED-006' },
    { name: 'Ramesh Sharma', phone: '9815130996', idNum: 'TEST-CIT-SEED-007' },
    { name: 'Aditi Rao', phone: '9850829994', idNum: 'TEST-CIT-SEED-008' },
    { name: 'Nikhil Kumar', phone: '9816898711', idNum: 'TEST-CIT-SEED-009' },
    { name: 'Vikas Swaminathan', phone: '9843486832', idNum: 'TEST-CIT-SEED-010' },
    { name: 'Citizen Vikram', phone: '9777773625', idNum: 'TEST-CIT-SEED-011' },
    { name: 'Citizen Ananya', phone: '9666673625', idNum: 'TEST-CIT-SEED-012' },
    { name: 'Citizen Rahul', phone: '9755532811', idNum: 'TEST-CIT-SEED-013' },
    { name: 'Aarav Patel', phone: '9876543210', idNum: 'TEST-CIT-SEED-014' },
    { name: 'Ramesh Sharma', phone: '9854222318', idNum: 'TEST-CIT-SEED-015' },
    { name: 'Sneha Roy', phone: '9825528197', idNum: 'TEST-CIT-SEED-016' },
  ];

  const citizenUserMap = new Map();
  for (const c of citizenConfigs) {
    const u = await prisma.user.create({
      data: {
        name: c.name,
        mobileNumber: c.phone,
        testIdentityNumber: c.idNum,
        password: passwordHash,
        role: 'CITIZEN',
      },
    });
    citizenUserMap.set(c.phone, u);
  }

  // 3. Shelters (Exactly 14 canonical shelters across Bengaluru: 2 OVER_CAPACITY, 7 NEAR_CAPACITY, 5 AVAILABLE)
  const sheltersData = [
    {
      id: '00000000-0000-0000-0000-000000000101',
      name: 'Koramangala Indoor Stadium',
      address: '80 Feet Road, Koramangala 4th Block, Bengaluru',
      latitude: 12.9340,
      longitude: 77.6220,
      capacity: 1000,
      contactNumber: '080-25531122',
      status: 'AVAILABLE',
    },
    {
      id: '00000000-0000-0000-0000-000000000102',
      name: 'Our Lady of Vailankanni Hall',
      address: 'Yelahanka New Town, Bengaluru',
      latitude: 13.1010,
      longitude: 77.5970,
      capacity: 45,
      contactNumber: '080-28562211',
      status: 'OVER_CAPACITY',
    },
    {
      id: '00000000-0000-0000-0000-000000000103',
      name: 'Mangaldhama Multi Utility Hall',
      address: '12th Main Road, HAL 2nd Stage, Indiranagar, Bengaluru',
      latitude: 12.9710,
      longitude: 77.6430,
      capacity: 40,
      contactNumber: '080-25284455',
      status: 'OVER_CAPACITY',
    },
    {
      id: '00000000-0000-0000-0000-000000000104',
      name: 'M. Chinnaswamy Stadium',
      address: 'MG Road, Cubbon Park, Bengaluru',
      latitude: 12.9788,
      longitude: 77.5996,
      capacity: 2000,
      contactNumber: '080-22861234',
      status: 'AVAILABLE',
    },
    {
      id: '00000000-0000-0000-0000-000000000105',
      name: 'Sree Kanteerava Stadium',
      address: 'Kasturba Road, Sampangi Rama Nagar, Bengaluru',
      latitude: 12.9698,
      longitude: 77.5926,
      capacity: 1500,
      contactNumber: '080-22214455',
      status: 'AVAILABLE',
    },
    {
      id: '00000000-0000-0000-0000-000000000106',
      name: 'Nadaprabhu Kempegowda Stadium',
      address: 'Magadi Main Road, Vijayanagar, Bengaluru',
      latitude: 12.9830,
      longitude: 77.5250,
      capacity: 900,
      contactNumber: '080-23301122',
      status: 'AVAILABLE',
    },
    {
      id: '00000000-0000-0000-0000-000000000107',
      name: 'Atal Bihari Vajpayee Stadium',
      address: '27th Main Road, HSR Layout Sector 1, Bengaluru',
      latitude: 12.9125,
      longitude: 77.6380,
      capacity: 800,
      contactNumber: '080-25723344',
      status: 'AVAILABLE',
    },
    {
      id: '00000000-0000-0000-0000-000000000108',
      name: 'Dr. B. R. Ambedkar Community Hall',
      address: 'Old Airport Road, Domlur, Bengaluru',
      latitude: 12.9770,
      longitude: 77.6240,
      capacity: 55,
      contactNumber: '080-25356677',
      status: 'NEAR_CAPACITY',
    },
    {
      id: '00000000-0000-0000-0000-000000000109',
      name: 'Sahakara Nagar Indoor Stadium',
      address: '60 Feet Road, Sahakara Nagar, Bengaluru',
      latitude: 13.0620,
      longitude: 77.5890,
      capacity: 60,
      contactNumber: '080-23621144',
      status: 'NEAR_CAPACITY',
    },
    {
      id: '00000000-0000-0000-0000-000000000110',
      name: 'Verdant Convention Hall',
      address: 'Neeladri Road, Electronic City Phase 1, Bengaluru',
      latitude: 12.8450,
      longitude: 77.6620,
      capacity: 50,
      contactNumber: '080-28521155',
      status: 'NEAR_CAPACITY',
    },
    {
      id: '00000000-0000-0000-0000-000000000111',
      name: 'Kempapura Indoor Stadium',
      address: 'Coffee Board Layout, Kempapura, Hebbal, Bengaluru',
      latitude: 13.0480,
      longitude: 77.5980,
      capacity: 50,
      contactNumber: '080-23631188',
      status: 'NEAR_CAPACITY',
    },
    {
      id: '00000000-0000-0000-0000-000000000112',
      name: 'ECC Centre Community Hall',
      address: 'Whitefield Main Road, Inner Circle, Bengaluru',
      latitude: 12.9690,
      longitude: 77.7490,
      capacity: 45,
      contactNumber: '080-28452233',
      status: 'NEAR_CAPACITY',
    },
    {
      id: '00000000-0000-0000-0000-000000000113',
      name: "St. John's Community Centre",
      address: 'Benson Cross Road, Benson Town, Bengaluru',
      latitude: 12.9980,
      longitude: 77.6140,
      capacity: 40,
      contactNumber: '080-23547788',
      status: 'NEAR_CAPACITY',
    },
    {
      id: '00000000-0000-0000-0000-000000000114',
      name: 'Ideal Homes Community Hall',
      address: 'Rajarajeshwari Nagar, Bengaluru',
      latitude: 12.9260,
      longitude: 77.5180,
      capacity: 40,
      contactNumber: '080-28603344',
      status: 'NEAR_CAPACITY',
    },
  ];

  for (const s of sheltersData) {
    await prisma.shelter.create({ data: s });
  }

  // 4. Emergency Facilities (24 Real-World Emergency Facilities across Bengaluru)
  const facilitiesData = [
    // --- HOSPITALS (8) ---
    {
      name: "St. John's Medical College Hospital",
      type: 'HOSPITAL',
      address: 'Sarjapur Road, John Nagar, Koramangala, Bengaluru',
      latitude: 12.9304,
      longitude: 77.6200,
      contactNumber: '080-22065000',
    },
    {
      name: 'Manipal Hospital Old Airport Road',
      type: 'HOSPITAL',
      address: '98 HAL Old Airport Road, Kodihalli, Bengaluru',
      latitude: 12.9585,
      longitude: 77.6492,
      contactNumber: '080-25024444',
    },
    {
      name: 'NIMHANS Emergency Trauma Centre',
      type: 'HOSPITAL',
      address: 'Hosur Road, Lakkasandra, Bengaluru',
      latitude: 12.9432,
      longitude: 77.5959,
      contactNumber: '080-26995000',
    },
    {
      name: "St. Philomena's Hospital",
      type: 'HOSPITAL',
      address: 'Mother Theresa Road, Viveka Nagar, Austin Town, Bengaluru',
      latitude: 12.9610,
      longitude: 77.6190,
      contactNumber: '080-40164500',
    },
    {
      name: 'Jayanagar General Hospital',
      type: 'HOSPITAL',
      address: '4th T Block, Jayanagar, Bengaluru',
      latitude: 12.9240,
      longitude: 77.5930,
      contactNumber: '080-26560314',
    },
    {
      name: 'Apollo Cradle & Children’s Hospital',
      type: 'HOSPITAL',
      address: '5th Block, Koramangala, Bengaluru',
      latitude: 12.9345,
      longitude: 77.6180,
      contactNumber: '080-44249050',
    },
    {
      name: 'Fortis Hospital Richmond Road',
      type: 'HOSPITAL',
      address: '14 Richmond Road, Ashok Nagar, Bengaluru',
      latitude: 12.9700,
      longitude: 77.5980,
      contactNumber: '080-66214444',
    },
    {
      name: 'Victoria Hospital Emergency & Trauma Care',
      type: 'HOSPITAL',
      address: 'Fort Road, Near City Market, Kalasipalya, Bengaluru',
      latitude: 12.9634,
      longitude: 77.5744,
      contactNumber: '080-26701150',
    },

    // --- FIRE STATIONS (6) ---
    {
      name: 'Koramangala Fire Station',
      type: 'FIRE_STATION',
      address: '80 Feet Road, 6th Block, Koramangala, Bengaluru',
      latitude: 12.9370,
      longitude: 77.6260,
      contactNumber: '101',
    },
    {
      name: 'South Fire Station Jayanagar',
      type: 'FIRE_STATION',
      address: 'Madhavan Park, 3rd Block, Jayanagar, Bengaluru',
      latitude: 12.9320,
      longitude: 77.5850,
      contactNumber: '101',
    },
    {
      name: 'Mayo Hall Fire Station',
      type: 'FIRE_STATION',
      address: 'Residency Road, Ashok Nagar, Bengaluru',
      latitude: 12.9730,
      longitude: 77.6090,
      contactNumber: '101',
    },
    {
      name: 'Sarjapur Road Fire Station',
      type: 'FIRE_STATION',
      address: 'Outer Ring Road - Sarjapur Road Junction, Bengaluru',
      latitude: 12.9180,
      longitude: 77.6520,
      contactNumber: '101',
    },
    {
      name: 'High Grounds Fire Station',
      type: 'FIRE_STATION',
      address: 'Millers Road, Vasanth Nagar, Bengaluru',
      latitude: 12.9920,
      longitude: 77.5920,
      contactNumber: '101',
    },
    {
      name: 'Yelahanka Fire Substation',
      type: 'FIRE_STATION',
      address: 'Major Sandeep Unnikrishnan Road, Yelahanka, Bengaluru',
      latitude: 13.0980,
      longitude: 77.5940,
      contactNumber: '101',
    },

    // --- POLICE STATIONS (8) ---
    {
      name: 'Koramangala Police Station',
      type: 'POLICE_STATION',
      address: '80 Feet Road, 6th Block, Koramangala, Bengaluru',
      latitude: 12.9360,
      longitude: 77.6230,
      contactNumber: '080-22943455',
    },
    {
      name: 'Madiwala Police Station',
      type: 'POLICE_STATION',
      address: 'Hosur Road, Madiwala, Bengaluru',
      latitude: 12.9220,
      longitude: 77.6180,
      contactNumber: '080-22943465',
    },
    {
      name: 'Adugodi Police Station',
      type: 'POLICE_STATION',
      address: 'Hosur Main Road, Adugodi, Bengaluru',
      latitude: 12.9460,
      longitude: 77.6110,
      contactNumber: '080-22943475',
    },
    {
      name: 'Vivek Nagar Police Station',
      type: 'POLICE_STATION',
      address: 'Viveka Nagar, Austin Town, Bengaluru',
      latitude: 12.9570,
      longitude: 77.6210,
      contactNumber: '080-22943485',
    },
    {
      name: 'HSR Layout Police Station',
      type: 'POLICE_STATION',
      address: '27th Main Road, Sector 1, HSR Layout, Bengaluru',
      latitude: 12.9120,
      longitude: 77.6500,
      contactNumber: '080-22943495',
    },
    {
      name: 'Ashok Nagar Police Station',
      type: 'POLICE_STATION',
      address: 'Museum Road, Ashok Nagar, Bengaluru',
      latitude: 12.9690,
      longitude: 77.6060,
      contactNumber: '080-22943505',
    },
    {
      name: 'Ulsoor Police Station',
      type: 'POLICE_STATION',
      address: 'Old Madras Road, Halasuru, Bengaluru',
      latitude: 12.9760,
      longitude: 77.6270,
      contactNumber: '080-22943515',
    },
    {
      name: 'Indiranagar Police Station',
      type: 'POLICE_STATION',
      address: 'CMH Road, Indiranagar, Bengaluru',
      latitude: 12.9790,
      longitude: 77.6415,
      contactNumber: '080-22943525',
    },

    // --- EVACUATION CHECKPOINTS (2) ---
    {
      name: 'Silk Board Evacuation Checkpoint',
      type: 'CHECKPOINT',
      address: 'Central Silk Board Junction, Hosur Road, Bengaluru',
      latitude: 12.9175,
      longitude: 77.6235,
      contactNumber: '112',
    },
    {
      name: 'Hebbal Flyover Checkpoint',
      type: 'CHECKPOINT',
      address: 'Hebbal Outer Ring Road Junction, Bengaluru',
      latitude: 13.0360,
      longitude: 77.5975,
      contactNumber: '112',
    },
  ];

  for (const f of facilitiesData) {
    await prisma.emergencyFacility.create({ data: f });
  }

  // 5. Roads (Canonical Bengaluru transit routes)
  const roadsData = [
    {
      name: 'Hosur Road Evacuation Corridor',
      status: 'OPEN',
      coordinatesJson: JSON.stringify([
        [12.9175, 77.6235],
        [12.9250, 77.6200],
        [12.9340, 77.6150],
        [12.9500, 77.6050],
      ]),
    },
    {
      name: 'Koramangala 80 Feet Road Route',
      status: 'FLOODED',
      coordinatesJson: JSON.stringify([
        [12.9300, 77.6220],
        [12.9350, 77.6240],
        [12.9400, 77.6260],
      ]),
    },
    {
      name: 'Outer Ring Road Silk Board - Bellandur Transit',
      status: 'RESTRICTED',
      coordinatesJson: JSON.stringify([
        [12.9175, 77.6235],
        [12.9260, 77.6400],
        [12.9350, 77.6700],
      ]),
    },
    {
      name: 'Old Airport Road Relief Transit Corridor',
      status: 'OPEN',
      coordinatesJson: JSON.stringify([
        [12.9585, 77.6492],
        [12.9650, 77.6350],
        [12.9720, 77.6150],
      ]),
    },
  ];

  for (const r of roadsData) {
    await prisma.road.create({ data: r });
  }

  // 6. Disaster Events
  const now = new Date();

  // Secondary predicted disaster (older createdAt)
  await prisma.disasterEvent.create({
    data: {
      id: 'bd8b980a-028e-4057-af29-a70e76b13ed2',
      type: 'FLOOD',
      title: 'Bengaluru Urban Flash Floods — Central & Northern Basins',
      description: 'Elevated flood advisory and storm surges along Bellandur and Hebbal corridors.',
      alertLevel: 'RED',
      predictedStartTime: new Date(now.getTime() + 12 * 3600 * 1000),
      predictedEndTime: new Date(now.getTime() + 72 * 3600 * 1000),
      status: 'PREDICTED',
      createdById: rescuerCommander.id,
      createdAt: new Date(now.getTime() - 60000),
    },
  });

  // Primary active Bengaluru flood disaster (newest createdAt so it is list[0])
  const primaryDisaster = await prisma.disasterEvent.create({
    data: {
      id: '00000000-0000-0000-0000-000000000601',
      type: 'FLOOD',
      title: 'Monsoon Flash Flood Warning — South Bengaluru Urban',
      description: 'Severe monsoon downpour inducing high-velocity surface runoff, lake breaches, and storm conduit overflow across Bengaluru.',
      alertLevel: 'ORANGE',
      predictedStartTime: new Date(now.getTime() - 2 * 3600 * 1000),
      predictedEndTime: new Date(now.getTime() + 48 * 3600 * 1000),
      status: 'ACTIVE',
      createdById: rescuerCommander.id,
      createdAt: now,
    },
  });

  // 7. Affected Zones (Exactly 9 Canonical Zones across Bengaluru)
  const zonesData = [
    {
      name: 'Zone A - High Risk Drainage Basin (Koramangala & HSR)',
      riskLevel: 'RED',
      polygonGeoJson: JSON.stringify([
        [12.9450, 77.6100],
        [12.9450, 77.6600],
        [12.9000, 77.6600],
        [12.9000, 77.6100],
        [12.9450, 77.6100],
      ]),
      radiusKm: 5.0,
    },
    {
      name: 'Zone B - Moderate Risk Overflow Perimeter',
      riskLevel: 'ORANGE',
      polygonGeoJson: JSON.stringify([
        [12.9400, 77.6200],
        [12.9400, 77.6700],
        [12.8950, 77.6700],
        [12.8950, 77.6200],
        [12.9400, 77.6200],
      ]),
      radiusKm: 5.0,
    },
    {
      name: 'Central Zone A (High Risk Red Zone)',
      riskLevel: 'RED',
      polygonGeoJson: JSON.stringify([
        [12.9650, 77.6000],
        [12.9650, 77.6180],
        [12.9800, 77.6180],
        [12.9800, 77.6000],
        [12.9650, 77.6000],
      ]),
      radiusKm: 5.0,
    },
    {
      name: 'Zone B - North Bengaluru Stormwater Basin (Hebbal-Hennur-Thanisandra)',
      riskLevel: 'ORANGE',
      polygonGeoJson: JSON.stringify([
        [13.0350, 77.5800],
        [13.0350, 77.6550],
        [13.0850, 77.6550],
        [13.0850, 77.5800],
        [13.0350, 77.5800],
      ]),
      radiusKm: 5.0,
    },
    {
      name: 'Kasavanahalli Lake Backflow Ring',
      riskLevel: 'ORANGE',
      polygonGeoJson: JSON.stringify([
        [12.8900, 77.6600],
        [12.8900, 77.7000],
        [12.9200, 77.7000],
        [12.9200, 77.6600],
        [12.8900, 77.6600],
      ]),
      radiusKm: 5.0,
    },
    {
      name: 'Vrishabhavathi Breach Corridor',
      riskLevel: 'RED',
      polygonGeoJson: JSON.stringify([
        [12.9200, 77.5200],
        [12.9200, 77.5450],
        [12.9500, 77.5450],
        [12.9500, 77.5200],
        [12.9200, 77.5200],
      ]),
      radiusKm: 5.0,
    },
    {
      name: 'Bellandur-Varthur Spillway Zone',
      riskLevel: 'RED',
      polygonGeoJson: JSON.stringify([
        [12.9300, 77.6700],
        [12.9300, 77.7400],
        [12.9600, 77.7400],
        [12.9600, 77.6700],
        [12.9300, 77.6700],
      ]),
      radiusKm: 5.0,
    },
    {
      name: 'Nagavara-Hennur Overflow Basin',
      riskLevel: 'ORANGE',
      polygonGeoJson: JSON.stringify([
        [13.0300, 77.6100],
        [13.0300, 77.6600],
        [13.0700, 77.6600],
        [13.0700, 77.6100],
        [13.0300, 77.6100],
      ]),
      radiusKm: 5.0,
    },
    {
      name: 'Pinakini Riverbank Flood Perimeter',
      riskLevel: 'ORANGE',
      polygonGeoJson: JSON.stringify([
        [13.0000, 77.7200],
        [13.0000, 77.7700],
        [13.0500, 77.7700],
        [13.0500, 77.7200],
        [13.0000, 77.7200],
      ]),
      radiusKm: 5.0,
    },
  ];

  for (const did of [primaryDisaster.id, 'bd8b980a-028e-4057-af29-a70e76b13ed2']) {
    for (const z of zonesData) {
      await prisma.affectedZone.create({
        data: {
          disasterId: did,
          name: z.name,
          riskLevel: z.riskLevel,
          polygonGeoJson: z.polygonGeoJson,
          radiusKm: z.radiusKm,
        },
      });
    }
  }

  // 8. Households & Members (Exactly 16 Canonical Residential Buildings in Bengaluru)
  const buildingsConfig = [
    {
      phone: '9800000011',
      name: 'Palm Meadows Villa 101',
      address: '80 Feet Road, Koramangala 4th Block',
      city: 'Bengaluru',
      state: 'Karnataka',
      lat: 12.9352,
      lng: 77.6245,
      adults: 3,
      children: 2,
      elderly: 1,
    },
    {
      phone: '9800000012',
      name: 'Salarpuria Sattva Greenage',
      address: 'Hosur Main Road, Bommanahalli',
      city: 'Bengaluru',
      state: 'Karnataka',
      lat: 12.9690,
      lng: 77.6110,
      adults: 36,
      children: 12,
      elderly: 8,
    },
    {
      phone: '9800000013',
      name: 'Prestige Shantiniketan',
      address: 'ITPL Main Road, Whitefield',
      city: 'Bengaluru',
      state: 'Karnataka',
      lat: 12.9750,
      lng: 77.6140,
      adults: 37,
      children: 13,
      elderly: 7,
    },
    {
      phone: '9800000014',
      name: 'Mantri Webcity',
      address: 'Hennur Main Road, Narayanapura',
      city: 'Bengaluru',
      state: 'Karnataka',
      lat: 13.0550,
      lng: 77.6450,
      adults: 35,
      children: 12,
      elderly: 7,
    },
    {
      phone: '9800000015',
      name: 'Sobha Dream Acres',
      address: 'Panathur Main Road, Balagere',
      city: 'Bengaluru',
      state: 'Karnataka',
      lat: 12.9380,
      lng: 77.7120,
      adults: 36,
      children: 12,
      elderly: 7,
    },
    {
      phone: '9800000016',
      name: 'Purva Skywood',
      address: 'Haralur Road, Off Sarjapur Road',
      city: 'Bengaluru',
      state: 'Karnataka',
      lat: 12.9050,
      lng: 77.6650,
      adults: 33,
      children: 11,
      elderly: 6,
    },
    {
      phone: '9815130996',
      name: 'Brigade Gateway Apartments',
      address: '26/1 Dr. Rajkumar Road, Malleshwaram-Rajajinagar',
      city: 'Bengaluru',
      state: 'Karnataka',
      lat: 12.9725,
      lng: 77.6065,
      adults: 38,
      children: 13,
      elderly: 7,
    },
    {
      phone: '9850829994',
      name: 'RMZ Latitude',
      address: 'Hebbal Kempapura, Bellary Road',
      city: 'Bengaluru',
      state: 'Karnataka',
      lat: 13.0420,
      lng: 77.5890,
      adults: 34,
      children: 12,
      elderly: 6,
    },
    {
      phone: '9816898711',
      name: 'Embassy Lake Terraces',
      address: 'Outer Ring Road, Hebbal',
      city: 'Bengaluru',
      state: 'Karnataka',
      lat: 13.0480,
      lng: 77.5950,
      adults: 32,
      children: 10,
      elderly: 6,
    },
    {
      phone: '9843486832',
      name: 'Brigade Millennium',
      address: 'Millennium Avenue, JP Nagar 7th Phase',
      city: 'Bengaluru',
      state: 'Karnataka',
      lat: 12.8940,
      lng: 77.5790,
      adults: 35,
      children: 11,
      elderly: 7,
    },
    {
      phone: '9777773625',
      name: 'SNN Raj Serenity',
      address: 'Begur Koppa Road, Yelenahalli',
      city: 'Bengaluru',
      state: 'Karnataka',
      lat: 12.8750,
      lng: 77.6250,
      adults: 33,
      children: 10,
      elderly: 6,
    },
    {
      phone: '9666673625',
      name: 'Prestige Falaknuma',
      address: 'Koramangala 1st Block, Near Silk Board',
      city: 'Bengaluru',
      state: 'Karnataka',
      lat: 12.9210,
      lng: 77.6150,
      adults: 35,
      children: 12,
      elderly: 7,
    },
    {
      phone: '9755532811',
      name: 'Godrej Woodsman Estate',
      address: 'Bellary Road, Hebbal',
      city: 'Bengaluru',
      state: 'Karnataka',
      lat: 13.0510,
      lng: 77.5920,
      adults: 30,
      children: 10,
      elderly: 6,
    },
    {
      phone: '9876543210',
      name: 'Phoenix One Bangalore West',
      address: '1 Dr. Rajkumar Road, Rajajinagar',
      city: 'Bengaluru',
      state: 'Karnataka',
      lat: 12.9982,
      lng: 77.5564,
      adults: 35,
      children: 11,
      elderly: 6,
    },
    {
      phone: '9854222318',
      name: 'Total Environment Windmills of Your Mind',
      address: 'Road No 3, EPIP Zone, Whitefield',
      city: 'Bengaluru',
      state: 'Karnataka',
      lat: 12.9784,
      lng: 77.7282,
      adults: 34,
      children: 10,
      elderly: 6,
    },
    {
      phone: '9825528197',
      name: 'Bhartiya City Nikoo Homes',
      address: 'Thanisandra Main Road, Kannuru',
      city: 'Bengaluru',
      state: 'Karnataka',
      lat: 13.0720,
      lng: 77.6380,
      adults: 35,
      children: 12,
      elderly: 7,
    },
  ];

  const allCreatedMembers = [];
  const householdList = [];

  for (let i = 0; i < buildingsConfig.length; i++) {
    const cfg = buildingsConfig[i];
    const user = citizenUserMap.get(cfg.phone)!;

    const hh = await prisma.household.create({
      data: {
        userId: user.id,
        name: cfg.name,
        address: cfg.address,
        city: cfg.city,
        state: cfg.state,
        latitude: cfg.lat,
        longitude: cfg.lng,
      },
    });
    householdList.push({ household: hh, config: cfg, user });

    // Generate members
    if (cfg.name === 'Palm Meadows Villa 101') {
      const pmMembers = [
        { name: 'Ramesh Iyer', age: 38, rel: 'Self', cat: 'ADULT' },
        { name: 'Sita Iyer', age: 36, rel: 'Spouse', cat: 'ADULT' },
        { name: 'Aarav Iyer', age: 10, rel: 'Child', cat: 'CHILD' },
        { name: 'Ananya Iyer', age: 7, rel: 'Child', cat: 'CHILD' },
        { name: 'Savitri Iyer', age: 68, rel: 'Parent', cat: 'ELDERLY' },
      ];
      for (const m of pmMembers) {
        const mem = await prisma.householdMember.create({
          data: {
            householdId: hh.id,
            name: m.name,
            age: m.age,
            relationship: m.rel,
            category: m.cat,
          },
        });
        allCreatedMembers.push({ member: mem, household: hh, config: cfg });
      }
    } else {
      let idx = 1;
      for (let a = 0; a < cfg.adults; a++, idx++) {
        const mem = await prisma.householdMember.create({
          data: {
            householdId: hh.id,
            name: `Resident ${cfg.name.slice(0, 8)}-${idx}`,
            age: 25 + (idx % 35),
            relationship: idx === 1 ? 'Self' : 'Resident',
            category: 'ADULT',
          },
        });
        allCreatedMembers.push({ member: mem, household: hh, config: cfg });
      }
      for (let c = 0; c < cfg.children; c++, idx++) {
        const mem = await prisma.householdMember.create({
          data: {
            householdId: hh.id,
            name: `Child ${cfg.name.slice(0, 8)}-${idx}`,
            age: 2 + (idx % 15),
            relationship: 'Child',
            category: 'CHILD',
          },
        });
        allCreatedMembers.push({ member: mem, household: hh, config: cfg });
      }
      for (let e = 0; e < cfg.elderly; e++, idx++) {
        const mem = await prisma.householdMember.create({
          data: {
            householdId: hh.id,
            name: `Elder ${cfg.name.slice(0, 8)}-${idx}`,
            age: 62 + (idx % 22),
            relationship: 'Parent',
            category: 'ELDERLY',
          },
        });
        allCreatedMembers.push({ member: mem, household: hh, config: cfg });
      }
    }
  }

  // 9. Expected Locations with deterministic, realistic per-building occupancy:
  // - Small households (2-5): 2 staying home
  // - Medium/Large apartments in RED zones: 15-19 staying home (evacuation prioritized)
  // - Medium/Large apartments in ORANGE zones: 21-25 staying home
  // - Safe zones: 35-38 staying home
  const buildingPlanTargets: Record<string, { home: number; shelter: number; otherCity: number; unknown: number }> = {
    // 6 RED Zones (High Risk Flood Plain)
    'Palm Meadows Villa 101': { home: 2, shelter: 2, otherCity: 1, unknown: 0 }, // total 5
    'Salarpuria Sattva Greenage': { home: 18, shelter: 28, otherCity: 7, unknown: 3 }, // total 56
    'Prestige Shantiniketan': { home: 16, shelter: 30, otherCity: 8, unknown: 3 }, // total 57
    'Brigade Gateway Apartments': { home: 19, shelter: 28, otherCity: 8, unknown: 3 }, // total 58
    'Prestige Falaknuma': { home: 15, shelter: 29, otherCity: 7, unknown: 3 }, // total 54
    'Sobha Dream Acres': { home: 17, shelter: 28, otherCity: 7, unknown: 3 }, // total 55

    // 6 ORANGE Zones (Moderate Risk Overflow)
    'Bhartiya City Nikoo Homes': { home: 24, shelter: 20, otherCity: 7, unknown: 3 }, // total 54
    'Embassy Lake Terraces': { home: 22, shelter: 18, otherCity: 6, unknown: 2 }, // total 48
    'Godrej Woodsman Estate': { home: 21, shelter: 17, otherCity: 6, unknown: 2 }, // total 46
    'Mantri Webcity': { home: 25, shelter: 19, otherCity: 7, unknown: 3 }, // total 54
    'Purva Skywood': { home: 23, shelter: 18, otherCity: 6, unknown: 3 }, // total 50
    'RMZ Latitude': { home: 24, shelter: 19, otherCity: 6, unknown: 3 }, // total 52

    // 4 SAFE Areas (Unaffected)
    'Brigade Millennium': { home: 38, shelter: 8, otherCity: 5, unknown: 2 }, // total 53
    'Phoenix One Bangalore West': { home: 37, shelter: 8, otherCity: 5, unknown: 2 }, // total 52
    'SNN Raj Serenity': { home: 35, shelter: 8, otherCity: 4, unknown: 2 }, // total 49
    'Total Environment Windmills of Your Mind': { home: 36, shelter: 8, otherCity: 4, unknown: 2 }, // total 50
  };

  const OTHER_CITIES = ['Mysuru', 'Chennai', 'Hyderabad', 'Coimbatore', 'Mangaluru'];
  let shelterIndex = 0;
  let otherCityIndex = 0;

  // Group created members by building name
  const membersByBuilding: Record<string, typeof allCreatedMembers> = {};
  for (const item of allCreatedMembers) {
    const bName = item.config.name;
    if (!membersByBuilding[bName]) membersByBuilding[bName] = [];
    membersByBuilding[bName].push(item);
  }

  for (const [bName, members] of Object.entries(membersByBuilding)) {
    const plan = buildingPlanTargets[bName] || { home: Math.floor(members.length * 0.4), shelter: Math.floor(members.length * 0.4), otherCity: Math.floor(members.length * 0.15), unknown: members.length - Math.floor(members.length * 0.95) };
    let assignedHome = 0;
    let assignedShelter = 0;
    let assignedOther = 0;

    for (let i = 0; i < members.length; i++) {
      const item = members[i];
      let expectedType = 'HOME';
      let shelterId: string | null = null;
      let otherCity: string | null = null;

      if (assignedHome < plan.home) {
        expectedType = 'HOME';
        assignedHome++;
      } else if (assignedShelter < plan.shelter) {
        expectedType = 'SHELTER';
        shelterId = sheltersData[shelterIndex % sheltersData.length].id;
        shelterIndex++;
        assignedShelter++;
      } else if (assignedOther < plan.otherCity) {
        expectedType = 'OTHER_CITY';
        otherCity = OTHER_CITIES[otherCityIndex % OTHER_CITIES.length];
        otherCityIndex++;
        assignedOther++;
      } else {
        expectedType = 'UNKNOWN';
      }

      const targetDisasterIds = [primaryDisaster.id, 'bd8b980a-028e-4057-af29-a70e76b13ed2'];
      for (const did of targetDisasterIds) {
        await prisma.expectedLocation.create({
          data: {
            disasterId: did,
            householdMemberId: item.member.id,
            expectedType,
            shelterId,
            otherCity,
            reconfirmedStatus: 'SAME_PLAN',
            reconfirmedAt: new Date(),
          },
        });
      }

      // Emergency Status
      let status = 'SAFE';
      if (item.config.name === 'Palm Meadows Villa 101' || item.config.name === 'Salarpuria Sattva Greenage') {
        if (i % 4 === 0) status = 'IN_DISTRESS';
        else if (i % 5 === 0) status = 'UNACCOUNTED';
      }
      await prisma.emergencyStatus.create({
        data: {
          disasterId: primaryDisaster.id,
          householdMemberId: item.member.id,
          status,
        },
      });
    }
  }

  // 9b. Seed realistic prioritized rescue requests across Bengaluru
  const demoRescueRequests = [
    {
      score: 95,
      status: 'PENDING',
      address: 'Plot 412, 14th Main, HSR Layout Sector 6, near Agara Lake breach',
      lat: 12.9152,
      lng: 77.6385,
      desc: '[P:5, C:2, E:1, D:0, I:1, W:CHEST_LEVEL, T:FLOOD_TRAPPED] Ground floor apartment submerged under 5.5ft floodwaters. Diabetic elderly resident requires oxygen cylinder and 2 infants trapped on upper shelf.',
      conditions: ['WATER_RISING', 'SERIOUSLY_UNWELL', 'TRAPPED', 'CHILDREN_INFANTS_PRESENT', 'HEAVILY_INJURED'],
      assignment: null,
    },
    {
      score: 85,
      status: 'TEAM_ASSIGNED',
      address: 'Villa 28, Rainbow Drive Layout, Sarjapur Road',
      lat: 12.9180,
      lng: 77.6840,
      desc: '[P:3, C:0, E:1, D:1, I:1, W:CHEST_LEVEL, T:FLOOD_TRAPPED] Wheelchair-bound resident with severe head injury from collapsing compound wall. Rapid water ingress into ground living room.',
      conditions: ['WATER_RISING', 'HEAVILY_INJURED', 'PHYSICALLY_DISABLED', 'TRAPPED'],
      assignment: {
        teamName: 'NDRF 10th Battalion — Alpha Flood Squad',
        notes: 'Aquatic rescue team deployed with Gemini motorized inflatable boat and paramedic.',
        status: 'TEAM_ASSIGNED',
      },
    },
    {
      score: 70,
      status: 'IN_PROGRESS',
      address: 'Flat 104, Sai Nivas, ST Bed Layout, Koramangala 4th Block',
      lat: 12.9344,
      lng: 77.6280,
      desc: '[P:4, C:1, E:1, D:0, I:0, W:WAIST_LEVEL, T:FLOOD] Stormwater drain overflowed into basement parking and ground floor corridor. Evacuation boat required for mother and toddler.',
      conditions: ['WATER_RISING', 'CHILDREN_INFANTS_PRESENT', 'NEED_RESCUE'],
      assignment: {
        teamName: 'Karnataka SDRF — Bravo Quick Response Team',
        notes: 'SDRF boat unit in transit through Ejipura junction; ETA 8 minutes.',
        status: 'IN_PROGRESS',
      },
    },
    {
      score: 60,
      status: 'TEAM_ASSIGNED',
      address: 'Basement Level -1, Block 2B, Ecospace Business Park, Bellandur',
      lat: 12.9260,
      lng: 77.6810,
      desc: '[P:6, C:0, E:0, D:0, I:1, W:WAIST_LEVEL, T:TRAPPED] Shift workers stranded in basement cafeteria after outer perimeter wall gave way. Water waist deep with floating electrical debris.',
      conditions: ['TRAPPED', 'NEED_RESCUE'],
      assignment: {
        teamName: 'Bengaluru Fire & Emergency Services — Unit Charlie',
        notes: 'High-clearance rescue tender en route with de-watering pumps and hydraulic tools.',
        status: 'TEAM_ASSIGNED',
      },
    },
    {
      score: 45,
      status: 'PENDING',
      address: 'House 88, 3rd Cross, Sai Layout, Horamavu / KR Puram',
      lat: 13.0280,
      lng: 77.6580,
      desc: '[P:3, C:0, E:1, D:0, I:0, W:KNEE_LEVEL, T:FLOOD] Lake boundary overflow inundating residential lane. Ground floor knee-deep; elderly couple needs safe transfer to higher ground shelter.',
      conditions: ['WATER_RISING', 'NEED_RESCUE'],
      assignment: null,
    },
    {
      score: 35,
      status: 'PENDING',
      address: 'Building 12, Munnekolala Main Road, Marathahalli',
      lat: 12.9510,
      lng: 77.7120,
      desc: '[P:2, C:0, E:0, D:0, I:0, W:KNEE_LEVEL, T:FLOOD] Waterlogged street blocking exit. Power cutoff and low battery; requesting boat evacuation before nightfall.',
      conditions: ['NEED_RESCUE', 'OTHER'],
      assignment: null,
    },
    {
      score: 20,
      status: 'PENDING',
      address: 'House 56, 5th Main, HRBR Layout 2nd Block, Kalyan Nagar',
      lat: 13.0180,
      lng: 77.6480,
      desc: '[P:2, C:0, E:0, D:0, I:0, W:ANKLE_LEVEL, T:FLOOD] Minor street inundation reaching driveway. Family prepared to self-evacuate if rain intensifies; requesting standby guidance.',
      conditions: ['OTHER'],
      assignment: null,
    },
    {
      score: 15,
      status: 'PENDING',
      address: 'Bungalow 7, Dollars Colony, RMV 2nd Stage',
      lat: 13.0320,
      lng: 77.5750,
      desc: '[P:1, C:0, E:0, D:0, I:0, W:ANKLE_LEVEL, T:FLOOD] Water accumulation in storm drain causing mild backflow into garden. Requesting municipal drainage team inspection.',
      conditions: ['OTHER'],
      assignment: null,
    },
  ];

  for (let idx = 0; idx < demoRescueRequests.length; idx++) {
    const item = demoRescueRequests[idx];
    const targetMember = allCreatedMembers[idx] || allCreatedMembers[0];

    const req = await prisma.emergencyRequest.create({
      data: {
        disasterId: primaryDisaster.id,
        householdMemberId: targetMember.member.id,
        latitude: item.lat,
        longitude: item.lng,
        address: item.address,
        description: item.desc,
        priorityScore: item.score,
        rescueStatus: item.status,
      },
    });

    for (const cond of item.conditions) {
      await prisma.emergencyCondition.create({
        data: { emergencyRequestId: req.id, conditionType: cond },
      });
    }

    if (item.assignment) {
      await prisma.rescueAssignment.create({
        data: {
          emergencyRequestId: req.id,
          teamName: item.assignment.teamName,
          assignedByUserId: rescuerCommander.id,
          status: item.assignment.status,
          notes: item.assignment.notes,
        },
      });
    }
  }

  // 10. Sample Notifications
  const defaultCitizenUser = citizenUserMap.get('9800000011')!;
  await prisma.notification.createMany({
    data: [
      {
        userId: defaultCitizenUser.id,
        disasterId: primaryDisaster.id,
        type: 'DISASTER_ALERT',
        message: 'ORANGE ALERT: Severe Flash Flood Warning issued for Koramangala & HSR Basin.',
        status: 'UNREAD',
      },
      {
        userId: defaultCitizenUser.id,
        disasterId: primaryDisaster.id,
        type: 'EXPECTED_LOCATION_REQUEST',
        message: 'Please submit your household expected location and evacuation plan immediately.',
        status: 'READ',
      },
    ],
  });

  console.log('✅ Canonical Bengaluru seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
