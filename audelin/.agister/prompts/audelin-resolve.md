# Resolves the Swift packages' dependencies outside any agent's sandbox, so
# an implementer without network finds them in place.
(cd audelin/macos && timeout 300 swift package resolve) || exit $?
(cd audelin/macos/App && timeout 300 swift package resolve) || exit $?
(cd audelin/macos/PreviewApps && timeout 300 swift package resolve) || exit $?
echo resolved
