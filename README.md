# BeautyLens: Makeup Product Detection & Virtual Try-On Platform

## Team Information

| Name | Email | Role |
|---|---|---|
| Masuma Begum | mbegum24@myseneca.ca | Full Stack Developer / Tech Lead |
| Chloe Quijano | cquijano@myseneca.ca | Full Stack Developer / Tech Lead |
| Mary-Anne Ibeh | mibeh@myseneca.ca | Full Stack Developer / Tech Lead |

**Course:** SED800 Capstone II — 2026
**Instructors:** Miguel Watler, Marcel Jar
**Repository:** https://github.com/SED800/SkillCred

## Project Description

BeautyLens is a computer vision and augmented reality application that allows users to automatically identify makeup products using their device camera and virtually try those products on their own face in real time. The project directly addresses a gap in online and in-store beauty retail: consumers cannot easily visualize how a product will look on them before purchasing.

The system is built on a YOLOv8s object-detection model fine-tuned on a 2,715-image, 19-class makeup dataset, a MediaPipe Face Mesh engine returning 468 3D facial landmarks, a FastAPI backend, and a React Native mobile application. The application is being developed to production standards suitable for deployment in a real beauty retail environment.

The codebase originates from the SkillCred project developed in Capstone I. The FastAPI backend, Docker Compose deployment, SQLite persistence layer, and project management artefacts all transfer directly into BeautyLens. Capstone II focuses on completing the AR try-on feature, reaching production-grade model accuracy (mAP@0.5 ≥ 0.70), and delivering a UI and user experience suitable for a live beauty store deployment.
