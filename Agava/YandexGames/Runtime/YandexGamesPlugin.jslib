const yandexGamesLibrary = {

    // Class definition.

    $yandexGames: {
        isInitialized: false,

        isAuthorized: false,

        sdk: undefined,

        leaderboard: undefined,

        playerAccount: undefined,

        billing: undefined,

        isInitializeCalled: false,

        flags: undefined,

        yandexGamesSdkInitialize: function (successCallbackPtr) {
            if (yandexGames.isInitializeCalled) {
                return;
            }
            yandexGames.isInitializeCalled = true;

            const scriptSrc = '/sdk.js';
            
            if (window['YaGames']) {
                console.log('YaGames already exists. Initializing SDK...');
                this.initializeSdk(successCallbackPtr);
            } else {
                console.log('Adding SDK script...');
                const sdkScript = document.createElement('script');
                sdkScript.src = scriptSrc;
                sdkScript.onload = () => {
                    console.log('SDK script loaded.');
                    this.initializeSdk(successCallbackPtr);
                };
                sdkScript.onerror = () => {
                    console.error('Failed to load SDK script.');
                };
                document.head.appendChild(sdkScript);
            }
            
            // new yandex moderation requirement

            console.log("context menu hidden");
            document.addEventListener('contextmenu', function(e) {
                e.preventDefault();
            });
        },
		
		initializeSdk: function (successCallbackPtr) {
			window['YaGames'].init().then((sdk) => {
				this.sdk = sdk;
				console.log('SDK initialized.');

				// The { scopes: false } ensures personal data permission request window won't pop up,
				const playerAccountInitializationPromise = sdk.getPlayer({scopes: false}).then(function (playerAccount) {
					if (playerAccount.getMode() !== 'lite') {
						yandexGames.isAuthorized = true;
					}

					// Always contains permission info. Contains personal data as well if permissions were granted before.
					yandexGames.playerAccount = playerAccount;
				}).catch(function () {
					throw new Error('PlayerAccount failed to initialize.');
				});

				const leaderboardInitializationPromise = sdk.getLeaderboards().then(function (leaderboard) {
					yandexGames.leaderboard = leaderboard;
				}).catch(function () {
					throw new Error('Leaderboard failed to initialize.');
				});

				const billingInitializationPromise = sdk.getPayments({signed: true}).then(function (billing) {
					yandexGames.billing = billing;
				}).catch(function () {
					throw new Error('Billing failed to initialize.');
				});

				const getFlagsInitializationPromise = sdk.getFlags().then(flags => {
					yandexGames.flags = flags;
				}).catch(function () {
					throw new Error('Flags failed to initialize.');
				});

				Promise.allSettled([leaderboardInitializationPromise, playerAccountInitializationPromise, billingInitializationPromise,
					getFlagsInitializationPromise]).then(function () {
					yandexGames.isInitialized = true;
					dynCall('v', successCallbackPtr, []);
				});
			}).catch(() => {
				console.error('Failed to initialize SDK.');
		});
	},


        throwIfSdkNotInitialized: function () {
            if (!yandexGames.isInitialized) {
                throw new Error('SDK is not initialized. Invoke YandexGamesSdk.Initialize() coroutine and wait for it to finish.');
            }
        },

        gameReady: function () {
            yandexGames.sdk.features.LoadingAPI.ready();
        },

        gameStart: function () {
            yandexGames.sdk.features.GameplayAPI.start();
        },

        gameStop: function () {
            yandexGames.sdk.features.GameplayAPI.stop();
        },

        invokeErrorCallback: function (error, errorCallbackPtr) {
            var errorMessage;
            if (error instanceof Error) {
                errorMessage = error.message;
                if (errorMessage === null) {
                    errorMessage = 'SDK API thrown an error with null message.'
                }
                if (errorMessage === undefined) {
                    errorMessage = 'SDK API thrown an error with undefined message.'
                }
            } else if (typeof error === 'string') {
                errorMessage = error;
            } else if (error) {
                errorMessage = 'SDK API thrown an unexpected type as error: ' + JSON.stringify(error);
            } else if (error === null) {
                errorMessage = 'SDK API thrown a null as error.';
            } else {
                errorMessage = 'SDK API thrown an undefined as error.';
            }

            const errorUnmanagedStringPtr = yandexGames.allocateUnmanagedString(errorMessage);
            dynCall('vi', errorCallbackPtr, [errorUnmanagedStringPtr]);
            _free(errorUnmanagedStringPtr);
        },

        invokeErrorCallbackIfNotAuthorized: function (errorCallbackPtr) {
            if (!yandexGames.isAuthorized) {
                yandexGames.invokeErrorCallback(new Error('Needs authorization.'), errorCallbackPtr);
                return true;
            }
            return false;
        },

        getYandexGamesSdkEnvironment: function () {
            const environmentJson = JSON.stringify(yandexGames.sdk.environment);
            const environmentJsonUnmanagedStringPtr = yandexGames.allocateUnmanagedString(environmentJson);
            return environmentJsonUnmanagedStringPtr;
        },

        getYandexGamesSdki18nLang: function ()
        {
            var lang = yandexGames.sdk.environment.i18n.lang;
            
            const langStringPtr = yandexGames.allocateUnmanagedString(lang);
            return langStringPtr;
        },

        getDeviceType: function () {
            const deviceType = yandexGames.sdk.deviceInfo.type;

            switch (deviceType) {
                case 'desktop':
                    return 0;
                case 'mobile':
                    return 1;
                case 'tablet':
                    return 2;
                case 'tv':
                    return 3;
                default:
                    console.error('Unexpected ysdk.deviceInfo response from Yandex. Assuming that it is desktop. deviceType = '
                        + JSON.stringify(deviceType));
                    return 0;
            }
        },

        playerAccountStartAuthorizationPolling: function (delay, successCallbackPtr, errorCallbackPtr) {
            if (yandexGames.isAuthorized) {
                console.error('Already authorized.');
                dynCall('v', errorCallbackPtr, []);
                return;
            }

            function authorizationPollingLoop() {
                if (yandexGames.isAuthorized) {
                    dynCall('v', successCallbackPtr, []);
                    return;
                }

                yandexGames.sdk.getPlayer({scopes: false}).then(function (playerAccount) {
                    if (playerAccount.getMode() !== 'lite') {
                        yandexGames.isAuthorized = true;
                        yandexGames.playerAccount = playerAccount;
                        dynCall('v', successCallbackPtr, []);
                    } else {
                        setTimeout(authorizationPollingLoop, delay);
                    }
                });
            };

            authorizationPollingLoop();
        },

        playerAccountAuthorize: function (successCallbackPtr, errorCallbackPtr) {
            if (yandexGames.isAuthorized) {
                console.error('Already authorized.');
                dynCall('v', successCallbackPtr, []);
                return;
            }

            yandexGames.sdk.auth.openAuthDialog().then(function () {
                yandexGames.sdk.getPlayer({scopes: false}).then(function (playerAccount) {
                    yandexGames.isAuthorized = true;
                    yandexGames.playerAccount = playerAccount;
                    dynCall('v', successCallbackPtr, []);
                }).catch(function (error) {
                    console.error('authorize failed to update playerAccount. Assuming authorization failed. Error was: ' + error.message);
                    yandexGames.invokeErrorCallback(error, errorCallbackPtr);
                });
            }).catch(function (error) {
                yandexGames.invokeErrorCallback(error, errorCallbackPtr);
            });
        },

        getPlayerAccountHasPersonalProfileDataPermission: function () {
            var publicNamePermission = undefined;
            if ('_personalInfo' in yandexGames.playerAccount && 'scopePermissions' in yandexGames.playerAccount._personalInfo) {
                publicNamePermission = yandexGames.playerAccount._personalInfo.scopePermissions.public_name;
            }

            switch (publicNamePermission) {
                case 'forbid':
                    return false;
                case 'not_set':
                    return false;
                case 'allow':
                    return true;
                default:
                    console.error('Unexpected response from Yandex. Assuming profile data permissions were not granted. playerAccount = '
                        + JSON.stringify(yandexGames.playerAccount));
                    return false;
            }
        },

        playerAccountRequestPersonalProfileDataPermission: function (successCallbackPtr, errorCallbackPtr) {
            yandexGames.sdk.getPlayer({scopes: true}).then(function (playerAccount) {
                yandexGames.playerAccount = playerAccount;

                if (yandexGames.getPlayerAccountHasPersonalProfileDataPermission()) {
                    dynCall('v', successCallbackPtr, []);
                } else {
                    yandexGames.invokeErrorCallback(new Error('User has refused the permission request.'), errorCallbackPtr);
                }
            }).catch(function (error) {
                yandexGames.invokeErrorCallback(error, errorCallbackPtr);
            });
        },

        playerAccountGetProfileData: function (successCallbackPtr, errorCallbackPtr, pictureSize) {
            yandexGames.sdk.getPlayer({scopes: false}).then(function (playerAccount) {
                yandexGames.playerAccount = playerAccount;

                playerAccount._personalInfo.profilePicture = playerAccount.getPhoto(pictureSize);

                const profileDataJson = JSON.stringify(playerAccount._personalInfo);
                const profileDataUnmanagedStringPtr = yandexGames.allocateUnmanagedString(profileDataJson);
                dynCall('vi', successCallbackPtr, [profileDataUnmanagedStringPtr]);
                _free(profileDataUnmanagedStringPtr);
            }).catch(function (error) {
                yandexGames.invokeErrorCallback(error, errorCallbackPtr);
            });
        },
        playerAccountGetCloudSaveData: function (successCallbackPtr, errorCallbackPtr) {
            yandexGames.playerAccount.getData().then(function (сloudSaveData) {
                const сloudSaveDataUnmanagedStringPtr = yandexGames.allocateUnmanagedString(JSON.stringify(сloudSaveData));
                dynCall('vi', successCallbackPtr, [сloudSaveDataUnmanagedStringPtr]);
                _free(сloudSaveDataUnmanagedStringPtr);
            }).catch(function (error) {
                yandexGames.invokeErrorCallback(error, errorCallbackPtr);
            });
        },

        playerAccountSetCloudSaveData: function (сloudSaveDataJson, flush, successCallbackPtr, errorCallbackPtr) {
            var сloudSaveData = JSON.parse(сloudSaveDataJson);
            yandexGames.playerAccount.setData(сloudSaveData, flush).then(function () {
                dynCall('v', successCallbackPtr, []);
            }).catch(function (error) {
                yandexGames.invokeErrorCallback(error, errorCallbackPtr);
            });
        },

        getFlags: function (defaultFlags, clientFeatures, successCallbackFlagsPtr, errorCallbackFlagsPtr) {
            yandexGames.sdk.getFlags({
                defaultFlags: JSON.parse(defaultFlags),
                clientFeatures: JSON.parse(clientFeatures)
            })
                .then(function (flags) {
                    var flagsStringJsonPtr = yandexGames.allocateUnmanagedString(JSON.stringify(flags));
                    dynCall('vi', successCallbackFlagsPtr, [flagsStringJsonPtr]);
                }).catch(function (error) {
                yandexGames.invokeErrorCallback(error, errorCallbackFlagsPtr);
            });
        },

        interstitialAdShow: function (openCallbackPtr, closeCallbackPtr, errorCallbackPtr, offlineCallbackPtr) {
            yandexGames.sdk.adv.showFullscreenAdv({
                callbacks: {
                    onOpen: function () {
                        dynCall('v', openCallbackPtr, []);
                    },
                    onClose: function (wasShown) {
                        dynCall('vi', closeCallbackPtr, [wasShown]);
                    },
                    onError: function (error) {
                        yandexGames.invokeErrorCallback(error, errorCallbackPtr);
                    },
                    onOffline: function () {
                        dynCall('v', offlineCallbackPtr, []);
                    },
                }
            });
        },

        videoAdShow: function (openCallbackPtr, rewardedCallbackPtr, closeCallbackPtr, errorCallbackPtr) {
            yandexGames.sdk.adv.showRewardedVideo({
                callbacks: {
                    onOpen: function () {
                        dynCall('v', openCallbackPtr, []);
                    },
                    onRewarded: function () {
                        dynCall('v', rewardedCallbackPtr, []);
                    },
                    onClose: function () {
                        dynCall('v', closeCallbackPtr, []);
                    },
                    onError: function (error) {
                        yandexGames.invokeErrorCallback(error, errorCallbackPtr);
                    },
                }
            });
        },

        stickyAdShow: function () {
            yandexGames.sdk.adv.showBannerAdv();
        },

        stickyAdHide: function () {
            yandexGames.sdk.adv.hideBannerAdv();
        },

        leaderboardSetScore: function (leaderboardName, score, successCallbackPtr, errorCallbackPtr, extraData) {
            if (yandexGames.invokeErrorCallbackIfNotAuthorized(errorCallbackPtr)) {
                console.error('leaderboardSetScore requires authorization.');
                return;
            }

            yandexGames.leaderboard.setLeaderboardScore(leaderboardName, score, extraData).then(function () {
                dynCall('v', successCallbackPtr, []);
            }).catch(function (error) {
                yandexGames.invokeErrorCallback(error, errorCallbackPtr);
            });
        },

        leaderboardGetEntries: function (leaderboardName, successCallbackPtr, errorCallbackPtr, topPlayersCount, competingPlayersCount, includeSelf, pictureSize) {
            if (yandexGames.invokeErrorCallbackIfNotAuthorized(errorCallbackPtr)) {
                console.error('leaderboardGetEntries requires authorization.');
                return;
            }

            yandexGames.leaderboard.getLeaderboardEntries(leaderboardName, {
                includeUser: includeSelf, quantityAround: competingPlayersCount, quantityTop: topPlayersCount
            }).then(function (response) {
                response.entries.forEach(function (entry) {
                    entry.player.profilePicture = entry.player.getAvatarSrc({size: pictureSize});
                });

                const entriesJson = JSON.stringify(response);
                const entriesUnmanagedStringPtr = yandexGames.allocateUnmanagedString(entriesJson);
                dynCall('vi', successCallbackPtr, [entriesUnmanagedStringPtr]);
                _free(entriesUnmanagedStringPtr);
            }).catch(function (error) {
                yandexGames.invokeErrorCallback(error, errorCallbackPtr);
            });
        },

        leaderboardGetPlayerEntry: function (leaderboardName, successCallbackPtr, errorCallbackPtr, pictureSize) {
            if (yandexGames.invokeErrorCallbackIfNotAuthorized(errorCallbackPtr)) {
                console.error('leaderboardGetPlayerEntry requires authorization.');
                return;
            }

            yandexGames.leaderboard.getLeaderboardPlayerEntry(leaderboardName).then(function (response) {
                response.player.profilePicture = response.player.getAvatarSrc({size: pictureSize});

                const entryJson = JSON.stringify(response);
                const entryJsonUnmanagedStringPtr = yandexGames.allocateUnmanagedString(entryJson);
                dynCall('vi', successCallbackPtr, [entryJsonUnmanagedStringPtr]);
                _free(entryJsonUnmanagedStringPtr);
            }).catch(function (error) {
                console.error('leaderboardGetPlayerEntry error message:', error.message);
                if (error.message === 'Player is not present in leaderboard') {
                    const nullUnmanagedStringPtr = yandexGames.allocateUnmanagedString('null');
                    dynCall('vi', successCallbackPtr, [nullUnmanagedStringPtr]);
                    _free(nullUnmanagedStringPtr);
                } else {
                    yandexGames.invokeErrorCallback(error, errorCallbackPtr);
                }
            });
        },

        billingPurchaseProduct: function (productId, successCallbackPtr, errorCallbackPtr, developerPayload) {
            yandexGames.billing.purchase({
                id: productId,
                developerPayload: developerPayload
            }).then(function (purchaseResponse) {
                purchaseResponse = {purchaseData: purchaseResponse.purchaseData, signature: purchaseResponse.signature};

                const purchasedProductJson = JSON.stringify(purchaseResponse);
                const purchasedProductJsonUnmanagedStringPtr = yandexGames.allocateUnmanagedString(purchasedProductJson);
                dynCall('vi', successCallbackPtr, [purchasedProductJsonUnmanagedStringPtr]);
                _free(purchasedProductJsonUnmanagedStringPtr);
            }).catch(function (error) {
                yandexGames.invokeErrorCallback(error, errorCallbackPtr);
            });
        },

        billingConsumeProduct: function (purchasedProductToken, successCallbackPtr, errorCallbackPtr) {
            yandexGames.billing.consumePurchase(purchasedProductToken).then(function (consumedProduct) {
                dynCall('v', successCallbackPtr, []);
            }).catch(function (error) {
                yandexGames.invokeErrorCallback(error, errorCallbackPtr);
            });
        },

        billingGetProductCatalog: function (pictureSize, successCallbackPtr, errorCallbackPtr) {
            yandexGames.billing.getCatalog().then(function (productCatalogResponse) {
                var catalogResponse = productCatalogResponse;
                var productList = [];
                
                catalogResponse.forEach(product => {
                    var description = product.description;
                    var id = product.id;
                    var imageURI = product.imageURI;
                    var price = product.price;
                    var priceCurrencyCode = product.priceCurrencyCode;
                    var priceValue = product.priceValue;
                    var priceCurrencyPicture = product.getPriceCurrencyImage(pictureSize);
                    var title = product.title;

                    productList.push({
                        priceCurrencyPicture: priceCurrencyPicture,
                        description: description,
                        id: id,
                        imageURI: imageURI,
                        price: price,
                        priceCurrencyCode: priceCurrencyCode,
                        priceValue: priceValue,
                        title: title
                    });
                });
                
                productCatalogResponse = {
                    products: productList,
                    signature: productCatalogResponse.signature
                };
               
                const productCatalogJson = JSON.stringify(productCatalogResponse);
                const productCatalogJsonUnmanagedStringPtr = yandexGames.allocateUnmanagedString(productCatalogJson);
                dynCall('vi', successCallbackPtr, [productCatalogJsonUnmanagedStringPtr]);
                _free(productCatalogJsonUnmanagedStringPtr);
            }).catch(function (error) {
                yandexGames.invokeErrorCallback(error, errorCallbackPtr);
            });
        },

        billingGetPurchasedProducts: function (successCallbackPtr, errorCallbackPtr) {
            yandexGames.billing.getPurchases().then(function (purchasesResponse) {
                purchasesResponse = {purchasedProducts: purchasesResponse, signature: purchasesResponse.signature};

                const purchasedProductsJson = JSON.stringify(purchasesResponse);
                const purchasedProductsJsonUnmanagedStringPtr = yandexGames.allocateUnmanagedString(purchasedProductsJson);
                dynCall('vi', successCallbackPtr, [purchasedProductsJsonUnmanagedStringPtr]);
                _free(purchasedProductsJsonUnmanagedStringPtr);
            }).catch(function (error) {
                yandexGames.invokeErrorCallback(error, errorCallbackPtr);
            });
        },

        shortcutCanSuggest: function (resultCallbackPtr) {
            yandexGames.sdk.shortcut.canShowPrompt().then(function (prompt) {
                dynCall('vi', resultCallbackPtr, [prompt.canShow]);
            });
        },

        shortcutSuggest: function (resultCallbackPtr) {
            yandexGames.sdk.shortcut.showPrompt().then(function (result) {
                dynCall('vi', resultCallbackPtr, [result.outcome === 'accepted']);
            });
        },

        reviewPopupCanOpen: function (resultCallbackPtr) {
            yandexGames.sdk.feedback.canReview().then(function (result, reason) {
                if (!reason) {
                    reason = 'No reason';
                }
                const reasonUnmanagedStringPtr = yandexGames.allocateUnmanagedString(reason);
                dynCall('vii', resultCallbackPtr, [result, reasonUnmanagedStringPtr]);
                _free(reasonUnmanagedStringPtr);
            });
        },

        reviewPopupOpen: function (resultCallbackPtr) {
            yandexGames.sdk.feedback.requestReview().then(function (result) {
                dynCall('vi', resultCallbackPtr, [result]);
            });
        },

        allocateUnmanagedString: function (string) {
            const stringBufferSize = lengthBytesUTF8(string) + 1;
            const stringBufferPtr = _malloc(stringBufferSize);
            stringToUTF8(string, stringBufferPtr, stringBufferSize);
            return stringBufferPtr;
        },
    },


    // External C# calls.

    YandexGamesSdkInitialize: function (successCallbackPtr) {
        yandexGames.yandexGamesSdkInitialize(successCallbackPtr);
    },

    GetYandexGamesSdkIsInitialized: function () {
        return yandexGames.isInitialized;
    },

    GetYandexGamesSdkEnvironment: function () {
        yandexGames.throwIfSdkNotInitialized();

        return yandexGames.getYandexGamesSdkEnvironment();
    },

    GetYandexGamesSdki18nLang: function () {
        yandexGames.throwIfSdkNotInitialized();

        return yandexGames.getYandexGamesSdki18nLang();
    },

    GetDeviceType: function () {
        yandexGames.throwIfSdkNotInitialized();

        return yandexGames.getDeviceType();
    },

    PlayerAccountStartAuthorizationPolling: function (delay, successCallbackPtr, errorCallbackPtr) {
        yandexGames.throwIfSdkNotInitialized();

        yandexGames.playerAccountStartAuthorizationPolling(delay, successCallbackPtr, errorCallbackPtr);
    },

    PlayerAccountAuthorize: function (successCallbackPtr, errorCallbackPtr) {
        yandexGames.throwIfSdkNotInitialized();

        yandexGames.playerAccountAuthorize(successCallbackPtr, errorCallbackPtr);
    },

    GetPlayerAccountIsAuthorized: function () {
        yandexGames.throwIfSdkNotInitialized();

        return yandexGames.isAuthorized;
    },

    GetPlayerAccountHasPersonalProfileDataPermission: function () {
        yandexGames.throwIfSdkNotInitialized();

        return yandexGames.getPlayerAccountHasPersonalProfileDataPermission();
    },

    PlayerAccountRequestPersonalProfileDataPermission: function (successCallbackPtr, errorCallbackPtr) {
        yandexGames.throwIfSdkNotInitialized();

        yandexGames.playerAccountRequestPersonalProfileDataPermission(successCallbackPtr, errorCallbackPtr);
    },

    PlayerAccountGetProfileData: function (successCallbackPtr, errorCallbackPtr, pictureSizePtr) {
        yandexGames.throwIfSdkNotInitialized();

        const pictureSize = UTF8ToString(pictureSizePtr);

        yandexGames.playerAccountGetProfileData(successCallbackPtr, errorCallbackPtr, pictureSize);
    },

    PlayerAccountGetCloudSaveData: function (successCallbackPtr, errorCallbackPtr) {
        yandexGames.throwIfSdkNotInitialized();

        yandexGames.playerAccountGetCloudSaveData(successCallbackPtr, errorCallbackPtr);
    },

    GetFlags: function (defaultFlags, clientFeatures, successCallbackPtr, errorCallbackPtr) {
        yandexGames.throwIfSdkNotInitialized();

        const defaultFlagsJson = UTF8ToString(defaultFlags);
        const clientFeaturesJson = UTF8ToString(clientFeatures);

        yandexGames.getFlags(defaultFlagsJson, clientFeaturesJson, successCallbackPtr, errorCallbackPtr);
    },

    PlayerAccountSetCloudSaveData: function (сloudSaveDataJsonPtr, flush, successCallbackPtr, errorCallbackPtr) {
        yandexGames.throwIfSdkNotInitialized();

        const сloudSaveDataJson = UTF8ToString(сloudSaveDataJsonPtr);

        yandexGames.playerAccountSetCloudSaveData(сloudSaveDataJson, flush, successCallbackPtr, errorCallbackPtr);
    },

    InterstitialAdShow: function (openCallbackPtr, closeCallbackPtr, errorCallbackPtr, offlineCallbackPtr) {
        yandexGames.throwIfSdkNotInitialized();

        yandexGames.interstitialAdShow(openCallbackPtr, closeCallbackPtr, errorCallbackPtr, offlineCallbackPtr);
    },

    VideoAdShow: function (openCallbackPtr, rewardedCallbackPtr, closeCallbackPtr, errorCallbackPtr) {
        yandexGames.throwIfSdkNotInitialized();

        yandexGames.videoAdShow(openCallbackPtr, rewardedCallbackPtr, closeCallbackPtr, errorCallbackPtr);
    },

    StickyAdShow: function () {
        yandexGames.throwIfSdkNotInitialized();

        yandexGames.stickyAdShow();
    },

    StickyAdHide: function () {
        yandexGames.throwIfSdkNotInitialized();

        yandexGames.stickyAdHide();
    },

    LeaderboardSetScore: function (leaderboardNamePtr, score, successCallbackPtr, errorCallbackPtr, extraDataPtr) {
        yandexGames.throwIfSdkNotInitialized();

        const leaderboardName = UTF8ToString(leaderboardNamePtr);
        var extraData = UTF8ToString(extraDataPtr);
        if (extraData.length === 0) {
            extraData = undefined;
        }

        yandexGames.leaderboardSetScore(leaderboardName, score, successCallbackPtr, errorCallbackPtr, extraData);
    },

    LeaderboardGetEntries: function (leaderboardNamePtr, successCallbackPtr, errorCallbackPtr, topPlayersCount, competingPlayersCount, includeSelf, pictureSizePtr) {
        yandexGames.throwIfSdkNotInitialized();

        const leaderboardName = UTF8ToString(leaderboardNamePtr);
        // Booleans are transferred as either 1 or 0, so using !! to convert them to true or false.
        includeSelf = !!includeSelf;
        const pictureSize = UTF8ToString(pictureSizePtr);

        yandexGames.leaderboardGetEntries(leaderboardName, successCallbackPtr, errorCallbackPtr, topPlayersCount, competingPlayersCount, includeSelf, pictureSize);
    },

    LeaderboardGetPlayerEntry: function (leaderboardNamePtr, successCallbackPtr, errorCallbackPtr, pictureSizePtr) {
        yandexGames.throwIfSdkNotInitialized();

        const leaderboardName = UTF8ToString(leaderboardNamePtr);
        const pictureSize = UTF8ToString(pictureSizePtr);

        yandexGames.leaderboardGetPlayerEntry(leaderboardName, successCallbackPtr, errorCallbackPtr, pictureSize);
    },

    BillingPurchaseProduct: function (productIdPtr, successCallbackPtr, errorCallbackPtr, developerPayloadPtr) {
        yandexGames.throwIfSdkNotInitialized();

        const productId = UTF8ToString(productIdPtr);
        var developerPayload = UTF8ToString(developerPayloadPtr);
        if (developerPayload.length === 0) {
            developerPayload = undefined;
        }

        yandexGames.billingPurchaseProduct(productId, successCallbackPtr, errorCallbackPtr, developerPayload);
    },

    BillingConsumeProduct: function (purchasedProductTokenPtr, successCallbackPtr, errorCallbackPtr) {
        yandexGames.throwIfSdkNotInitialized();

        const purchasedProductToken = UTF8ToString(purchasedProductTokenPtr);

        yandexGames.billingConsumeProduct(purchasedProductToken, successCallbackPtr, errorCallbackPtr);
    },

    BillingGetProductCatalog: function (pictureSize, successCallbackPtr, errorCallbackPtr) {
        yandexGames.throwIfSdkNotInitialized();

        yandexGames.billingGetProductCatalog(pictureSize, successCallbackPtr, errorCallbackPtr);
    },

    BillingGetPurchasedProducts: function (successCallbackPtr, errorCallbackPtr) {
        yandexGames.throwIfSdkNotInitialized();

        yandexGames.billingGetPurchasedProducts(successCallbackPtr, errorCallbackPtr);
    },

    ShortcutCanSuggest: function (resultCallbackPtr) {
        yandexGames.throwIfSdkNotInitialized();

        yandexGames.shortcutCanSuggest(resultCallbackPtr);
    },

    ShortcutSuggest: function (resultCallbackPtr) {
        yandexGames.throwIfSdkNotInitialized();

        yandexGames.shortcutSuggest(resultCallbackPtr);
    },

    ReviewPopupCanOpen: function (resultCallbackPtr) {
        yandexGames.throwIfSdkNotInitialized();

        yandexGames.reviewPopupCanOpen(resultCallbackPtr);
    },

    ReviewPopupOpen: function (resultCallbackPtr) {
        yandexGames.throwIfSdkNotInitialized();

        yandexGames.reviewPopupOpen(resultCallbackPtr);
    },

    YandexGamesSdkGameReady: function () {
        yandexGames.throwIfSdkNotInitialized();

        yandexGames.gameReady();
    },

    YandexGamesSdkGameStart: function () {
        yandexGames.throwIfSdkNotInitialized();

        yandexGames.gameStart();
    },

    YandexGamesSdkGameStop: function () {
        yandexGames.throwIfSdkNotInitialized();

        yandexGames.gameStop();
    },

    YandexGamesSdkIsRunningOnYandex: function () {
        return window.location.hostname.includes('yandex');
    }
}

autoAddDeps(yandexGamesLibrary, '$yandexGames');
mergeInto(LibraryManager.library, yandexGamesLibrary);
