/**
 * Canonical Bengaluru Hospital Dataset for STRIDE Prototype.
 *
 * IMPORTANT:
 * - Hospital names, addresses, and approximate coordinates correspond to real-world Bengaluru facilities.
 * - Bed availability, ICU availability, emergency department status, doctor availability,
 *   and specialty availability are SIMULATED DEMO DATA for the prototype.
 * - This dataset is the SINGLE source of truth shared by Citizen, Authority, and Rescuer roles.
 */

export interface HospitalDoctor {
  name: string;
  speciality: string;
  onDuty: boolean;
  contact?: string;
}

export interface CanonicalHospital {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  contactNumber: string;
  totalBeds: number;
  availableBeds: number; // Demo simulated
  icuBedsTotal: number;
  icuBedsAvailable: number; // Demo simulated
  emergencyDepartmentAvailable: boolean; // Demo simulated
  emergencyStatusText: string;
  specialities: string[];
  doctors: HospitalDoctor[]; // Demo simulated
  facilityType: 'HOSPITAL';
  disclaimer: string;
}

export const DEMO_DATA_DISCLAIMER =
  '⚠️ DEMO DATA: Bed and doctor availability is simulated for the STRIDE prototype and does not represent live hospital capacity.';

export const CANONICAL_BENGALURU_HOSPITALS: CanonicalHospital[] = [
  {
    id: '803bdaec-4f58-4a2f-a5e4-510d6ca15d88',
    name: "St. John's Medical College Hospital",
    address: 'Sarjapur Road, John Nagar, Koramangala, Bengaluru - 560034',
    latitude: 12.9304,
    longitude: 77.62,
    contactNumber: '080-22065000',
    totalBeds: 1200,
    availableBeds: 78,
    icuBedsTotal: 120,
    icuBedsAvailable: 14,
    emergencyDepartmentAvailable: true,
    emergencyStatusText: 'Operational — 24/7 Level-1 Trauma & Emergency Active',
    specialities: [
      'Trauma & Emergency Care',
      'Critical Care / ICU',
      'Cardiology',
      'General Surgery',
      'Orthopedics',
      'Pediatrics',
      'Neurology',
      'Pulmonology',
    ],
    doctors: [
      { name: 'Dr. Arvind Swamy', speciality: 'Trauma & Critical Care', onDuty: true, contact: '+91 80 2206 5101' },
      { name: 'Dr. Preeti Joseph', speciality: 'Emergency Medicine', onDuty: true, contact: '+91 80 2206 5102' },
      { name: 'Dr. K. N. Murthy', speciality: 'General & Trauma Surgery', onDuty: true, contact: '+91 80 2206 5103' },
      { name: 'Dr. Shalini Menon', speciality: 'Pediatric Emergency', onDuty: false, contact: '+91 80 2206 5104' },
    ],
    facilityType: 'HOSPITAL',
    disclaimer: DEMO_DATA_DISCLAIMER,
  },
  {
    id: '92f1fb91-c36a-43b7-a2d3-63d614e711e3',
    name: 'Manipal Hospital Old Airport Road',
    address: '98 HAL Old Airport Road, Kodihalli, Bengaluru - 560017',
    latitude: 12.9585,
    longitude: 77.6492,
    contactNumber: '080-25024444',
    totalBeds: 600,
    availableBeds: 42,
    icuBedsTotal: 75,
    icuBedsAvailable: 9,
    emergencyDepartmentAvailable: true,
    emergencyStatusText: 'Operational — 24/7 Emergency & Acute Care Active',
    specialities: [
      'Emergency Medicine',
      'Critical Care / ICU',
      'Cardiology & CTVS',
      'Orthopedics & Joint Replacement',
      'Neurology & Neurosurgery',
      'Gastroenterology',
    ],
    doctors: [
      { name: 'Dr. Vikramaditya Rao', speciality: 'Emergency Medicine', onDuty: true, contact: '+91 80 2502 4110' },
      { name: 'Dr. Meenakshi Sundaram', speciality: 'Critical Care & ICU', onDuty: true, contact: '+91 80 2502 4112' },
      { name: 'Dr. Rajeshwari Nair', speciality: 'Trauma Surgery', onDuty: true, contact: '+91 80 2502 4115' },
    ],
    facilityType: 'HOSPITAL',
    disclaimer: DEMO_DATA_DISCLAIMER,
  },
  {
    id: '26fd1a81-18f2-4ca9-a8cc-4fa227e34d06',
    name: 'NIMHANS Emergency Trauma Centre',
    address: 'Hosur Road, Lakkasandra, Bengaluru - 560029',
    latitude: 12.9432,
    longitude: 77.5959,
    contactNumber: '080-26995000',
    totalBeds: 500,
    availableBeds: 35,
    icuBedsTotal: 60,
    icuBedsAvailable: 8,
    emergencyDepartmentAvailable: true,
    emergencyStatusText: 'Operational — 24/7 Specialized Neuro-Trauma Center',
    specialities: [
      'Neuro-Trauma Emergency',
      'Neurology',
      'Neurosurgery',
      'Neuro-Critical Care',
      'Psychiatric Emergency',
    ],
    doctors: [
      { name: 'Dr. Harish Chandra', speciality: 'Neuro-Trauma Specialist', onDuty: true, contact: '+91 80 2699 5201' },
      { name: 'Dr. Sangeetha Bhat', speciality: 'Neuro-Critical Care', onDuty: true, contact: '+91 80 2699 5205' },
    ],
    facilityType: 'HOSPITAL',
    disclaimer: DEMO_DATA_DISCLAIMER,
  },
  {
    id: '10d83fe2-134b-4e47-98a0-9272cb8af8e2',
    name: 'Victoria Hospital Emergency & Trauma Care',
    address: 'Fort Road, Near City Market, Kalasipalya, Bengaluru - 560002',
    latitude: 12.9634,
    longitude: 77.5744,
    contactNumber: '080-26701150',
    totalBeds: 1000,
    availableBeds: 64,
    icuBedsTotal: 90,
    icuBedsAvailable: 11,
    emergencyDepartmentAvailable: true,
    emergencyStatusText: 'Operational — Apex Government Emergency & Disaster Hub',
    specialities: [
      'Trauma & Emergency Care',
      'Burns & Plastic Surgery Unit',
      'General Surgery',
      'Orthopedic Trauma',
      'Forensic & Mass Casualty Triage',
    ],
    doctors: [
      { name: 'Dr. B. R. Venkatesh', speciality: 'Chief Disaster Medical Officer', onDuty: true, contact: '+91 80 2670 1190' },
      { name: 'Dr. Divya Prakash', speciality: 'Burns & Trauma Specialist', onDuty: true, contact: '+91 80 2670 1192' },
      { name: 'Dr. Mohan Kumar', speciality: 'Orthopedic Trauma Surgeon', onDuty: true, contact: '+91 80 2670 1194' },
    ],
    facilityType: 'HOSPITAL',
    disclaimer: DEMO_DATA_DISCLAIMER,
  },
  {
    id: 'a17eeff5-019b-44ad-b26b-69a99019fc3f',
    name: 'Fortis Hospital Richmond Road',
    address: '14 Richmond Road, Ashok Nagar, Bengaluru - 560025',
    latitude: 12.97,
    longitude: 77.598,
    contactNumber: '080-66214444',
    totalBeds: 180,
    availableBeds: 16,
    icuBedsTotal: 30,
    icuBedsAvailable: 3,
    emergencyDepartmentAvailable: true,
    emergencyStatusText: 'Operational — 24/7 Advanced Acute Emergency Services',
    specialities: [
      'Emergency Medicine',
      'Critical Care',
      'Cardiology',
      'Orthopedics',
      'General Surgery',
    ],
    doctors: [
      { name: 'Dr. Anil Kumar', speciality: 'Emergency Physician', onDuty: true, contact: '+91 80 6621 4101' },
      { name: 'Dr. Nandini S.', speciality: 'Intensivist', onDuty: true, contact: '+91 80 6621 4104' },
    ],
    facilityType: 'HOSPITAL',
    disclaimer: DEMO_DATA_DISCLAIMER,
  },
  {
    id: '3713f803-6cdd-4679-b56f-763c2437c0b8',
    name: 'Jayanagar General Hospital',
    address: '4th T Block, Jayanagar, Bengaluru - 560041',
    latitude: 12.924,
    longitude: 77.593,
    contactNumber: '080-26560314',
    totalBeds: 300,
    availableBeds: 29,
    icuBedsTotal: 25,
    icuBedsAvailable: 4,
    emergencyDepartmentAvailable: true,
    emergencyStatusText: 'Operational — Public General Hospital 24/7 Casualty',
    specialities: [
      'General Casualty & Emergency',
      'Internal Medicine',
      'General Surgery',
      'Pediatrics',
      'Obstetrics & Gynecology',
    ],
    doctors: [
      { name: 'Dr. Raghavendra Gowda', speciality: 'Casualty Medical Officer', onDuty: true, contact: '+91 80 2656 0320' },
      { name: 'Dr. Usha Rani', speciality: 'Pediatric Care', onDuty: true, contact: '+91 80 2656 0322' },
    ],
    facilityType: 'HOSPITAL',
    disclaimer: DEMO_DATA_DISCLAIMER,
  },
  {
    id: 'ec759029-d922-436b-bf80-202ce0550629',
    name: "St. Philomena's Hospital",
    address: 'Mother Theresa Road, Viveka Nagar, Austin Town, Bengaluru - 560047',
    latitude: 12.961,
    longitude: 77.619,
    contactNumber: '080-40164500',
    totalBeds: 400,
    availableBeds: 31,
    icuBedsTotal: 45,
    icuBedsAvailable: 6,
    emergencyDepartmentAvailable: true,
    emergencyStatusText: 'Operational — 24/7 Emergency Medical Care',
    specialities: [
      'Emergency Medicine',
      'Critical Care',
      'Internal Medicine',
      'General Surgery',
      'Orthopedics',
    ],
    doctors: [
      { name: 'Dr. Anthony Thomas', speciality: 'Emergency Medicine', onDuty: true, contact: '+91 80 4016 4550' },
      { name: 'Dr. Kavitha Rajan', speciality: 'Intensivist', onDuty: true, contact: '+91 80 4016 4552' },
    ],
    facilityType: 'HOSPITAL',
    disclaimer: DEMO_DATA_DISCLAIMER,
  },
  {
    id: '04aeef2e-128b-49e1-aa35-8e36f6c294a5',
    name: 'Apollo Cradle & Children’s Hospital',
    address: '5th Block, Koramangala, Bengaluru - 560095',
    latitude: 12.9345,
    longitude: 77.618,
    contactNumber: '080-44249050',
    totalBeds: 120,
    availableBeds: 19,
    icuBedsTotal: 20,
    icuBedsAvailable: 5,
    emergencyDepartmentAvailable: true,
    emergencyStatusText: 'Operational — 24/7 Pediatric & Neonatal Emergency Unit',
    specialities: [
      'Pediatric Emergency',
      'NICU / PICU Critical Care',
      'Obstetrics & Maternity',
      'Pediatric Surgery',
    ],
    doctors: [
      { name: 'Dr. Archana Prasad', speciality: 'Senior Pediatric Intensivist', onDuty: true, contact: '+91 80 4424 9101' },
      { name: 'Dr. Srinivas Rao', speciality: 'Neonatologist', onDuty: true, contact: '+91 80 4424 9105' },
    ],
    facilityType: 'HOSPITAL',
    disclaimer: DEMO_DATA_DISCLAIMER,
  },
  {
    id: 'hosp-bowring-curzon-09',
    name: 'Bowring and Lady Curzon Hospital',
    address: 'Lady Curzon Road, Tasker Town, Shivaji Nagar, Bengaluru - 560001',
    latitude: 12.9833,
    longitude: 77.6033,
    contactNumber: '080-25591325',
    totalBeds: 700,
    availableBeds: 52,
    icuBedsTotal: 65,
    icuBedsAvailable: 8,
    emergencyDepartmentAvailable: true,
    emergencyStatusText: 'Operational — 24/7 Emergency & Casualty Ward',
    specialities: [
      'Trauma & Emergency',
      'Critical Care',
      'General Surgery',
      'Infectious Disease Triage',
      'Orthopedics',
    ],
    doctors: [
      { name: 'Dr. Mahendra Reddy', speciality: 'Emergency Medical Officer', onDuty: true, contact: '+91 80 2559 1330' },
      { name: 'Dr. Fatima Zahra', speciality: 'Critical Care Specialist', onDuty: true, contact: '+91 80 2559 1332' },
    ],
    facilityType: 'HOSPITAL',
    disclaimer: DEMO_DATA_DISCLAIMER,
  },
  {
    id: 'hosp-aster-cmi-10',
    name: 'Aster CMI Hospital Hebbal',
    address: 'No. 43/42, NH 44, Bellary Road, Sahakar Nagar, Hebbal, Bengaluru - 560092',
    latitude: 13.056,
    longitude: 77.5925,
    contactNumber: '080-43444444',
    totalBeds: 500,
    availableBeds: 48,
    icuBedsTotal: 80,
    icuBedsAvailable: 12,
    emergencyDepartmentAvailable: true,
    emergencyStatusText: 'Operational — 24/7 Tertiary Emergency & Trauma Care',
    specialities: [
      'Trauma & Emergency Care',
      'Critical Care / ICU',
      'Cardiac Emergency',
      'Organ Transplant & Surgery',
      'Neurology',
    ],
    doctors: [
      { name: 'Dr. Chetana Sharma', speciality: 'Emergency Consultant', onDuty: true, contact: '+91 80 4344 4110' },
      { name: 'Dr. Pradeep Nair', speciality: 'Trauma Surgeon', onDuty: true, contact: '+91 80 4344 4115' },
    ],
    facilityType: 'HOSPITAL',
    disclaimer: DEMO_DATA_DISCLAIMER,
  },
];

export const CANONICAL_HOSPITALS = CANONICAL_BENGALURU_HOSPITALS;
