source 'https://rubygems.org'

# No `ruby` directive on purpose: it makes Bundler write a RUBY VERSION into
# the lockfile, which then churns on every machine with a different Ruby.
# CocoaPods needs 2.7+; anything a current macOS ships with is fine.
gem 'cocoapods', '>= 1.13', '!= 1.15.0', '!= 1.15.1', '!= 1.15.2'
gem 'activesupport', '>= 6.1.7.5', '!= 7.1.0'

# cocoapods-core's gemspec pins activesupport < 8, so CocoaPods always resolves
# activesupport 7.x — which still calls JSON.generate(..., quirks_mode: true).
# The json gem dropped that keyword in 3.0, so `pod install` dies with
# "unknown keyword: quirks_mode" as soon as anything calls #to_json, which
# expo-modules-autolinking does. Hold json on 2.x until CocoaPods can resolve
# activesupport 8.
gem 'json', '~> 2.21'
