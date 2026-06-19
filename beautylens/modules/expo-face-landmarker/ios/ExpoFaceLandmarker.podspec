require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'ExpoFaceLandmarker'
  s.version        = package['version']
  s.summary        = package['description']
  s.description    = package['description']
  s.author         = 'BeautyLens'
  s.homepage       = 'https://github.com/SED800/SkillCred'
  s.platforms      = { :ios => '15.1' }
  s.source         = { :git => 'https://github.com/SED800/SkillCred.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.dependency 'MediaPipeTasksVision'

  s.source_files = '**/*.{h,m,mm,swift}'
  s.resources = 'Resources/*'
end
